import { MP_MAX_ATTEMPTS, backoffForMs, sleep } from "./backoff";
import type { MarketplaceAdapter, SyncDeps, SyncOutcome } from "./contract";
import { MARKETPLACE_MODULE } from "./index";
import { projectFromMirrors } from "./project";
import { MP_SCHEDULED_KINDS, MP_STALE_LOCK_MS, nextDueAt, type LastRun } from "./schedule";
import type MarketplaceModuleService from "./service";

/**
 * THE SCHEDULER (w16-mp-scheduler-ops, spec 2.6).
 *
 * `schedule.ts` says WHEN a triple (tenant x marketplace x kind) is due. This
 * file runs it, and it holds the three things a scheduler owes the owner:
 *
 *   1. ONE RUN PER TRIPLE. The lock is the `running` row of `mp_sync_run`
 *      itself, held by a partial unique index, so a second tick cannot start
 *      the same kind. Two runs would share one rate limit and both collect a
 *      429, which is the failure the rule exists to prevent.
 *   2. BACKOFF. The 429 policy is the shared one (`backoff.ts`): at most three
 *      attempts, one wait capped at 30 s, honouring the marketplace's own
 *      `Retry-After` / `X-Ratelimit-Retry`. No second policy is invented here.
 *   3. VISIBILITY. Every run leaves a row, and a run that did NOT happen
 *      leaves the loudest one: a `failed` row with the message, a
 *      `rate_limited` row with the window the marketplace named, or a stale
 *      lock closed as `failed` with the timeout in its text. A gap would read
 *      as "the marketplace had nothing" (rule 20a).
 *
 * READ-ONLY, unchanged (Ivan, 2026-09-16 02:46 WITA). Everything below calls
 * `adapter.runSync`, which calls registered reads and nothing else. The
 * scheduler adds no write path, no host, no method and no endpoint.
 */

/** What `runDueSyncs` needs. `container` is Medusa's own; the core resolves the core. */
export type SchedulerDeps = {
  container: SyncDeps["container"];
  tenantId: string;
  logger: Pick<Console, "info" | "warn" | "error">;
  /** Injectable for the tests. Defaults to the wall clock. */
  now?: () => Date;
  /**
   * The wait between two attempts, injectable for the tests.
   *
   * It is a SEAM and not a module mock on purpose: the backoff test has to
   * assert the numbers this loop actually asks for, and a spy on the imported
   * `sleep` cannot be installed at all under the compiler this repository uses
   * (swc emits the exports as getters). Defaults to the shared `sleep` of
   * `backoff.ts`, so production has one policy and one implementation.
   */
  sleep?: (ms: number) => Promise<void>;
};

export type ScheduledRun = {
  marketplace: string;
  kind: string;
  /** `skipped` means the triple was not due; the reason says why. */
  outcome: "succeeded" | "rate_limited" | "failed" | "skipped";
  reason: string;
  runId: string | null;
  rows: number;
  requests: number;
  attempts: number;
  error: string | null;
  retryAt: Date | null;
};

type RunRow = {
  id: string;
  kind: string;
  status: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  retry_at?: Date | string | null;
  rows: number;
  requests: number;
  error: string | null;
};

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const service = (deps: SchedulerDeps): MarketplaceModuleService =>
  deps.container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

/** The three columns the lock is taken on. Named once, checked below. */
const LOCK_KEYS = ["tenant_id", "marketplace", "kind"] as const;

/**
 * Postgres' unique-violation, in every shape it reaches this file in.
 *
 * MEASURED, not guessed. A raw `knex` insert throws the driver's error with
 * `code === "23505"`. The MODULE SERVICE does not: `dbErrorMapper`
 * (`@medusajs/utils` 2.19, `dal/mikro-orm/db-error-mapper.js`) catches the
 * 23505, builds a sentence out of the constraint detail and throws a
 * `MedusaError` — with `type: "invalid_data"`, `code: undefined` and NO
 * `cause` pointing back at the original. The first acceptance run of this task
 * died on exactly that: the lock worked, the scheduler did not recognise it.
 *
 * So the mapped sentence is evidence too:
 *
 *   Mp sync run with tenant_id: ten_…, marketplace: wb, kind: projection, already exists.
 *
 * It is matched on all three key names at once, which is the unique index of
 * `Migration20260916014707` and nothing else.
 */
export const isUniqueViolation = (error: unknown): boolean => {
  for (let cause: unknown = error, depth = 0; cause && depth < 6; depth += 1) {
    const entry = cause as { code?: unknown; message?: unknown; cause?: unknown };
    if (entry.code === "23505") {
      return true;
    }
    if (typeof entry.message === "string") {
      const message = entry.message;
      if (/duplicate key|unique constraint/i.test(message) && message.includes("mp_sync_run")) {
        return true;
      }
      if (
        /already exists\.?\s*$/i.test(message) &&
        LOCK_KEYS.every((key) => message.includes(`${key}:`))
      ) {
        return true;
      }
    }
    cause = entry.cause;
  }
  return false;
};

/** The newest run of one triple, or `null` when the kind has never run. */
export const newestRun = async (
  mp: MarketplaceModuleService,
  tenantId: string,
  marketplace: string,
  kind: string,
): Promise<RunRow | null> => {
  const rows = (await mp.listMpSyncRuns(
    { tenant_id: tenantId, marketplace, kind },
    { order: { started_at: "DESC" }, take: 1 },
  )) as RunRow[];
  return rows[0] ?? null;
};

/**
 * The row the due verdict is taken from: the `running` one if the triple has
 * one, otherwise the newest.
 *
 * NOT simply "the newest row", and the acceptance run of this task is why. A
 * lock is found by its STATUS, never by its recency: the moment some other row
 * of the triple is newer than the `running` one — a takeover that failed, a
 * row written by hand, a clock that moved — a newest-row lookup stops seeing
 * the lock at all and the scheduler starts a second run whose INSERT then dies
 * on the unique index. The index would still hold the rule, but the run would
 * be reported as an error instead of as «уже идёт».
 */
const lockOrNewest = async (
  mp: MarketplaceModuleService,
  tenantId: string,
  marketplace: string,
  kind: string,
): Promise<RunRow | null> => {
  const locked = (await mp.listMpSyncRuns(
    { tenant_id: tenantId, marketplace, kind, status: "running" },
    { order: { started_at: "DESC" }, take: 1 },
  )) as RunRow[];
  return locked[0] ?? (await newestRun(mp, tenantId, marketplace, kind));
};

/**
 * Closes a `running` row that has outlived `MP_STALE_LOCK_MS`.
 *
 * It is marked `failed` and not deleted. The process that opened it is gone
 * and will never say what happened, so the row is the only trace that a run
 * was attempted at all — and the owner is owed that fact, with the timeout
 * spelled out, rather than a kind that silently skipped an hour (rule 20a).
 */
const closeStaleLock = async (
  mp: MarketplaceModuleService,
  run: RunRow,
  now: Date,
  logger: SchedulerDeps["logger"],
  marketplace: string,
): Promise<void> => {
  const startedAt = asDate(run.started_at) ?? now;
  const minutes = Math.round((now.getTime() - startedAt.getTime()) / 60_000);
  const message =
    `Прогон не завершился: строка «running» стоит ${minutes} мин, ` +
    `дольше замка в ${MP_STALE_LOCK_MS / 60_000} мин. Процесс, который его начал, пропал ` +
    `(перезапуск бэкенда или падение). Замок снят, вид разрешён к запуску.`;

  await mp.updateMpSyncRuns({
    id: run.id,
    status: "failed",
    finished_at: now,
    error: message,
  });

  logger.error(
    `[mp-sync] ${marketplace} ${run.kind}: stale lock ${run.id} taken over after ${minutes} min ` +
      `(limit ${MP_STALE_LOCK_MS / 60_000} min), the row is now failed`,
  );
};

/**
 * The endpoint and status a failure came from, read out of the ADAPTER'S OWN
 * transport journal rather than parsed out of the message.
 *
 * The operator's log line has to name the endpoint id and the status
 * (spec 2.6), and both are already recorded, one row per request, by the
 * transport that sent it. Reading them costs one journal load and only on a
 * failure. A regex over the error text would be a second, weaker copy of what
 * the journal already knows.
 */
const failureCall = async (
  adapter: MarketplaceAdapter,
  syncDeps: SyncDeps,
  runId: string,
): Promise<{ endpointId: string; status: number | null } | null> => {
  try {
    const { calls } = await adapter.loadJournal(syncDeps);
    const mine = calls.filter((call) => String(call.sync_run_id ?? "") === runId);
    const bad = mine.filter(
      (call) => call.error !== null || (typeof call.status === "number" && call.status >= 400),
    );
    const last = bad[bad.length - 1] ?? mine[mine.length - 1];
    return last
      ? {
          endpointId: String(last.endpoint_id ?? "unknown"),
          status: typeof last.status === "number" ? last.status : null,
        }
      : null;
  } catch {
    /**
     * The journal is evidence, not the run. A marketplace whose journal cannot
     * be read must not turn a reported failure into a thrown one, so the log
     * line falls back to «endpoint unknown» and the run keeps its own message.
     */
    return null;
  }
};

/**
 * The core's own kind, shaped as an adapter outcome so the scheduler has one
 * code path. It spends no marketplace request, which is why its `requests` is
 * always zero and why it can never be rate limited.
 */
const runProjection = async (
  deps: SchedulerDeps,
  adapter: MarketplaceAdapter,
  runId: string,
): Promise<SyncOutcome> => {
  const result = await projectFromMirrors(
    { container: deps.container, tenantId: deps.tenantId, logger: deps.logger },
    adapter.id,
    { runId },
  );
  const rows = Object.entries(result.counts)
    .filter(([name]) => !name.startsWith("journal_"))
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    kind: "projection",
    runId: result.runId,
    rows,
    requests: 0,
    status: result.status,
    error: result.error,
    retryAt: null,
  };
};

/**
 * Runs ONE triple: takes the lock, calls the adapter, retries a rate-limited
 * answer inside the shared policy, and records what happened.
 *
 * `runSync` is the only thing it calls. `projection` is the core's own kind
 * and goes to `projectFromMirrors`, which spends no request at all.
 */
export const runOneSync = async (
  deps: SchedulerDeps,
  adapter: MarketplaceAdapter,
  kind: string,
  credentials: unknown,
): Promise<ScheduledRun> => {
  const mp = service(deps);
  const clock = deps.now ?? (() => new Date());
  const now = clock();

  const last = await lockOrNewest(mp, deps.tenantId, adapter.id, kind);
  const lastRun: LastRun | null = last
    ? {
        status: last.status,
        started_at: asDate(last.started_at) ?? now,
        finished_at: asDate(last.finished_at),
        retry_at: asDate(last.retry_at),
      }
    : null;

  const verdict = nextDueAt(lastRun, kind, now);

  if (!verdict.due) {
    return {
      marketplace: adapter.id,
      kind,
      outcome: "skipped",
      reason: verdict.reason,
      runId: last?.id ?? null,
      rows: 0,
      requests: 0,
      attempts: 0,
      error: null,
      retryAt: verdict.nextAt,
    };
  }

  if (last && verdict.reason === "stale_lock_taken_over") {
    await closeStaleLock(mp, last, now, deps.logger, adapter.id);
  }

  /**
   * The lock. The INSERT is the acquire: the partial unique index on
   * `(tenant_id, marketplace, kind) where status = 'running'` means a second
   * caller gets 23505 instead of a second run, and that is the whole
   * single-run rule. No network has been touched at this point, which is what
   * the concurrency test asserts with a fetch spy.
   */
  let lock: { id: string };
  try {
    lock = (await mp.createMpSyncRuns({
      tenant_id: deps.tenantId,
      marketplace: adapter.id,
      kind,
      status: "running",
      started_at: now,
      rows: 0,
      requests: 0,
      attempts: 0,
    })) as { id: string };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        marketplace: adapter.id,
        kind,
        outcome: "skipped",
        reason: "locked",
        runId: last?.id ?? null,
        rows: 0,
        requests: 0,
        attempts: 0,
        error: null,
        retryAt: null,
      };
    }
    throw error;
  }

  const syncDeps: SyncDeps = {
    container: deps.container,
    tenantId: deps.tenantId,
    credentials,
    logger: deps.logger,
  };

  let outcome: SyncOutcome | null = null;
  let attempts = 0;
  let thrown: string | null = null;

  /**
   * THE BACKOFF LOOP. `MP_MAX_ATTEMPTS` tries in total; between them the wait
   * the marketplace itself asked for, through the shared `backoffForMs` — the
   * same function the transports use, so there is one 429 policy in this
   * repository and not three. A window longer than the cap returns `null` and
   * ends the loop: a run that sleeps for three hours is a hung run, and the
   * scheduler will come back on its own interval anyway.
   *
   * Only a `rate_limited` answer is retried. A `failed` run is a defect or a
   * bad answer, and asking the same question twice as fast as possible would
   * spend the rate limit on a request already known to break.
   */
  while (attempts < MP_MAX_ATTEMPTS) {
    attempts += 1;
    try {
      outcome =
        kind === "projection"
          ? await runProjection(deps, adapter, lock.id)
          : await adapter.runSync(syncDeps, kind);
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
      outcome = null;
      break;
    }

    if (outcome.status !== "rate_limited" || attempts >= MP_MAX_ATTEMPTS) {
      break;
    }

    const askedMs = outcome.retryAt ? outcome.retryAt.getTime() - clock().getTime() : null;
    const wait = backoffForMs(askedMs !== null && askedMs > 0 ? askedMs : null, attempts);
    if (wait === null) {
      break;
    }

    deps.logger.warn(
      `[mp-sync] ${adapter.id} ${kind}: rate limited on attempt ${attempts}/${MP_MAX_ATTEMPTS}, ` +
        `waiting ${wait} ms before the next one`,
    );
    await (deps.sleep ?? sleep)(wait);
  }

  const finishedAt = clock();

  if (!outcome) {
    const message = thrown ?? "Адаптер не вернул результат прогона.";
    await mp.updateMpSyncRuns({
      id: lock.id,
      status: "failed",
      finished_at: finishedAt,
      attempts,
      error: message,
    });
    deps.logger.error(
      `[mp-sync] ${adapter.id} ${kind}: failed after ${attempts} attempt(s), ` +
        `endpoint unknown, status unknown: ${message}`,
    );
    return {
      marketplace: adapter.id,
      kind,
      outcome: "failed",
      reason: verdict.reason,
      runId: lock.id,
      rows: 0,
      requests: 0,
      attempts,
      error: message,
      retryAt: null,
    };
  }

  const retryAt = outcome.retryAt ?? null;

  await mp.updateMpSyncRuns({
    id: lock.id,
    status: outcome.status,
    finished_at: finishedAt,
    rows: outcome.rows,
    requests: outcome.requests,
    attempts,
    error: outcome.error,
    retry_at: retryAt,
    /**
     * The adapter's own run id, so `carryJournal` does not carry this import
     * in a second time under its derived id. `projection` reports into THIS
     * row already, so it has no source of its own.
     */
    source_run_id: kind === "projection" ? null : outcome.runId,
  });

  if (outcome.status === "succeeded") {
    deps.logger.info(
      `[mp-sync] ${adapter.id} ${kind}: ${outcome.rows} rows in ${outcome.requests} requests ` +
        `(attempt ${attempts}/${MP_MAX_ATTEMPTS})`,
    );
  } else {
    /**
     * EVERY failure names the marketplace, the kind, the endpoint id and the
     * status (spec 2.6). The endpoint and status come from the transport
     * journal of this very run, not from the message.
     */
    const call =
      kind === "projection" ? null : await failureCall(adapter, syncDeps, outcome.runId);
    const where = `endpoint ${call?.endpointId ?? "unknown"}, status ${call?.status ?? "unknown"}`;
    const line =
      `[mp-sync] ${adapter.id} ${kind}: ${outcome.status} after ${attempts} attempt(s), ` +
      `${where}: ${outcome.error ?? "без текста ошибки"}`;

    if (outcome.status === "rate_limited") {
      deps.logger.warn(
        `${line}${retryAt ? `. Площадка откроет окно в ${retryAt.toISOString()}` : ""}. ` +
          `Это ограничение площадки, а не поломка импорта.`,
      );
    } else {
      deps.logger.error(line);
    }
  }

  return {
    marketplace: adapter.id,
    kind,
    outcome: outcome.status,
    reason: verdict.reason,
    runId: lock.id,
    rows: outcome.rows,
    requests: outcome.requests,
    attempts,
    error: outcome.error,
    retryAt,
  };
};

/**
 * Every triple of one shop that is due right now.
 *
 * The marketplaces come from `registry.ts` and the kinds from each adapter, so
 * a third marketplace is scheduled by being registered. A shop with no key for
 * a marketplace is SKIPPED and not failed: not having connected Ozon is a
 * normal state of a shop, not an incident.
 */
export const runDueSyncs = async (
  deps: SchedulerDeps,
  adapters: readonly MarketplaceAdapter[],
  pg: unknown,
): Promise<ScheduledRun[]> => {
  const done: ScheduledRun[] = [];

  for (const adapter of adapters) {
    const slot = await adapter.readCredentials(pg, deps.tenantId);

    if (!slot || !slot.isEnabled) {
      done.push({
        marketplace: adapter.id,
        kind: "*",
        outcome: "skipped",
        reason: slot ? "integration_disabled" : "no_key",
        runId: null,
        rows: 0,
        requests: 0,
        attempts: 0,
        error: null,
        retryAt: null,
      });
      continue;
    }

    /**
     * The adapter's own kinds first, `projection` last: the projector reads
     * the mirrors the imports have just written, and running it first would
     * normalize the previous tick's data and call it fresh.
     */
    const kinds = [...adapter.syncKinds, "projection"].filter((kind) =>
      MP_SCHEDULED_KINDS.includes(kind),
    );

    for (const kind of kinds) {
      done.push(await runOneSync(deps, adapter, kind, slot.credentials));
    }
  }

  return done;
};
