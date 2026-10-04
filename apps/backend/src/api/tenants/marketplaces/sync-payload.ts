import type { MarketplaceAdapter } from "../../../modules/marketplace/contract";
import { EXPIRY_WARNING_DAYS } from "../../../modules/marketplace/contract";
import {
  MP_FAILURE_STATUSES,
  MP_SCHEDULED_KINDS,
  MP_SCHEDULER_CRON,
  MP_STALE_LOCK_MS,
  consecutiveFailures,
  intervalMsFor,
  nextDueAt,
} from "../../../modules/marketplace/schedule";
import { decideDue, runOneSync, type SchedulerDeps } from "../../../modules/marketplace/scheduler";
import type MarketplaceModuleService from "../../../modules/marketplace/service";

/**
 * The body of the «Обновление» screens, built once and served by both
 * `GET /tenants/marketplaces/sync` (every marketplace, w16-mp-scheduler-ops)
 * and `GET /tenants/marketplaces/:marketplace/sync` (one marketplace, task-07
 * of ask-20261005-023327-f02b).
 *
 * The one-marketplace route is a FILTER APPLIED BEFORE ANY READ, not a slice
 * of the full answer. Building every marketplace and dropping the others would
 * ask the Ozon key what it may do (a live `POST /v1/roles`) every time the
 * owner opens the Wildberries screen, and that screen promises no request to
 * any marketplace on open. So the adapters to describe are an argument, and
 * the route for one marketplace passes one.
 *
 * Everything below was the body of the w16 route and keeps its rules:
 *
 *   - a kind that has never run says so, and is not a zero. "0 rows" and
 *     "never ran" are different facts and the owner has to tell them apart
 *     (rule 20a);
 *   - the error of the LAST FAILURE is carried in full even when the newest
 *     run succeeded, because an import that fails every other hour is broken
 *     and a screen showing only the newest run would hide it;
 *   - a key expiring inside 14 days is a warning of its own. Ozon keys live
 *     three months, so this fires four times a year per shop and is an
 *     operation, not an incident (spec 3.2).
 */

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export type SyncRunRow = {
  id: string;
  kind: string;
  status: string;
  is_fixture: boolean;
  started_at: Date | string;
  finished_at: Date | string | null;
  retry_at: Date | string | null;
  attempts: number;
  rows: number;
  requests: number;
  error: string | null;
};

/** The reads the payload needs, so a unit test can hand in its own. */
export type SyncPayloadDeps = {
  pg: unknown;
  mp: Pick<MarketplaceModuleService, "listMpSyncRuns" | "createMpApiCalls">;
  tenantId: string;
  now?: Date;
};

/** The kinds one marketplace is scheduled for: its own, plus the core's projection. */
export const syncKindsOf = (adapter: Pick<MarketplaceAdapter, "syncKinds">): string[] => [
  ...adapter.syncKinds,
  "projection",
];

export const buildSyncEntry = async (
  deps: SyncPayloadDeps,
  adapter: MarketplaceAdapter,
  now: Date,
) => {
  const slot = await adapter.readCredentials(deps.pg, deps.tenantId);

  const facts = await adapter.inspectCredentials(slot?.credentials ?? null, {
    tenantId: deps.tenantId,
    /**
     * Asking an Ozon key what it may do IS a request to Ozon, and the shared
     * journal is what proves what left this process. `medusa lint` warns about
     * a service mutation in a route handler and the warning is kept on purpose,
     * exactly as `status-payload.ts` keeps it: this is one bookkeeping row
     * about a request this handler itself sent, and it has to be written by
     * whoever sent it or the evidence goes missing. On Wildberries the key is a
     * JWT decoded locally and this is never called.
     */
    journal: async (entry) => {
      await deps.mp.createMpApiCalls({ ...entry, marketplace: adapter.id });
    },
  });

  /**
   * Two hundred runs is far more than the screen shows, and it is what lets
   * «последняя ошибка» and «последний успех» be answered per kind without one
   * query per kind per fact.
   */
  const runs = (await deps.mp.listMpSyncRuns(
    { tenant_id: deps.tenantId, marketplace: adapter.id },
    { order: { started_at: "DESC" }, take: 200 },
  )) as SyncRunRow[];

  const kinds = syncKindsOf(adapter).map((kind) => {
    const ofKind = runs.filter((run) => run.kind === kind);
    const newest = ofKind[0] ?? null;
    const lastSuccess = ofKind.find((run) => run.status === "succeeded") ?? null;
    const lastFailure = ofKind.find((run) => MP_FAILURE_STATUSES.includes(run.status)) ?? null;
    const lastLimited = ofKind.find((run) => run.status === "rate_limited") ?? null;

    const verdict = nextDueAt(
      newest
        ? {
            status: newest.status,
            started_at: asDate(newest.started_at) ?? now,
            finished_at: asDate(newest.finished_at),
            retry_at: asDate(newest.retry_at),
            consecutive_failures: Math.max(consecutiveFailures(ofKind), 1),
          }
        : null,
      kind,
      now,
      slot?.updatedAt ?? null,
    );

    return {
      kind,
      /** `null` means NEVER RAN. The screen must not render it as a zero. */
      status: newest?.status ?? null,
      is_fixture: newest?.is_fixture ?? null,
      started_at: asIso(newest?.started_at),
      finished_at: asIso(newest?.finished_at ?? null),
      rows: newest ? Number(newest.rows) : null,
      requests: newest ? Number(newest.requests) : null,
      attempts: newest ? Number(newest.attempts ?? 1) : null,
      error: newest?.error ?? null,
      /** When this kind last came in whole, whatever happened since. */
      last_success_at: asIso(lastSuccess?.finished_at ?? null),
      last_success_rows: lastSuccess ? Number(lastSuccess.rows) : null,
      /** The last failure IN FULL, even when the newest run succeeded. */
      last_failure_at: asIso(lastFailure?.finished_at ?? lastFailure?.started_at ?? null),
      last_failure_error: lastFailure?.error ?? null,
      /** The window the marketplace itself named, when it named one. */
      retry_at: asIso(newest?.retry_at ?? lastLimited?.retry_at ?? null),
      runs: ofKind.length,
      interval_ms: intervalMsFor(kind),
      next_at: asIso(verdict.nextAt),
      due: verdict.due,
      due_reason: verdict.reason,
    };
  });

  return {
    id: adapter.id,
    label: adapter.label,
    connection: {
      key: { set: Boolean(slot), last4: slot?.last4 ?? null },
      is_enabled: slot?.isEnabled ?? false,
    },
    credentials: {
      expires_at: facts.expiresAt,
      expired: facts.expired,
      expires_in_days: facts.expiresInDays,
      expiring_soon: facts.expiringSoon,
      error: facts.error,
    },
    kinds,
  };
};

export type SyncEntry = Awaited<ReturnType<typeof buildSyncEntry>>;

export type SyncWarning = {
  marketplace: string;
  marketplace_label: string;
  kind: string | null;
  type: "no_key" | "key_expired" | "key_expiring" | "failed" | "never_ran";
  expires_at?: string | null;
  expires_in_days?: number | null;
  error?: string | null;
  text: string;
};

/**
 * WHAT needs attention, decided once here rather than in the panel: the rule
 * has to be one rule, and a second copy written in TSX would drift from this
 * one. WHAT IT READS LIKE is the panel's job — the fields below carry the
 * marketplace label, the kind id and the error, and the screen puts them into
 * a sentence with the kind in plain language («Карточки товаров», not
 * `cards`) and the locale the owner chose (rule 18e).
 *
 * `text` stays as the ready-made Russian sentence for a consumer that has no
 * catalog of its own: an alert, a digest, a report.
 *
 * Every warning names the marketplace it came from and only that one, so the
 * screen of one marketplace never carries another's.
 */
export const syncWarnings = (entries: readonly SyncEntry[]): SyncWarning[] =>
  entries.flatMap((entry) => {
    const found: SyncWarning[] = [];
    const head = (value: string | null | undefined, limit = 200): string =>
      !value ? "" : value.length > limit ? `${value.slice(0, limit)}…` : value;

    if (!entry.connection.key.set) {
      found.push({
        marketplace: entry.id,
        marketplace_label: entry.label,
        kind: null,
        type: "no_key",
        text: `${entry.label}: ключ не сохранён, синхронизация не запускается.`,
      });
    } else if (entry.credentials.expired) {
      found.push({
        marketplace: entry.id,
        marketplace_label: entry.label,
        kind: null,
        type: "key_expired",
        expires_at: entry.credentials.expires_at,
        text:
          `${entry.label}: ключ истёк. Выпустите новый в личном кабинете площадки — ` +
          `импорт остановлен.`,
      });
    } else if (entry.credentials.expiring_soon) {
      found.push({
        marketplace: entry.id,
        marketplace_label: entry.label,
        kind: null,
        type: "key_expiring",
        expires_at: entry.credentials.expires_at,
        expires_in_days: entry.credentials.expires_in_days,
        text:
          `${entry.label}: ключ истекает через ${entry.credentials.expires_in_days} дн. ` +
          `Выпустите новый в личном кабинете площадки — после истечения импорт остановится.`,
      });
    }

    for (const kind of entry.kinds) {
      if (kind.status !== null && MP_FAILURE_STATUSES.includes(kind.status)) {
        found.push({
          marketplace: entry.id,
          marketplace_label: entry.label,
          kind: kind.kind,
          type: "failed",
          error: head(kind.error),
          text: `${entry.label} / ${kind.kind}: последний прогон с ошибкой — ${head(kind.error) || "без текста"}`,
        });
      } else if (kind.status === null && entry.connection.key.set) {
        found.push({
          marketplace: entry.id,
          marketplace_label: entry.label,
          kind: kind.kind,
          type: "never_ran",
          text: `${entry.label} / ${kind.kind}: ни разу не запускалась.`,
        });
      }
    }

    return found;
  });

/**
 * The whole answer for the given marketplaces: one entry each, their
 * warnings, the schedule and the server's clock.
 *
 * It ASKS each key what it may do, unlike the list route: the expiry warning
 * is the point of the screen, and a cached answer would age. On Ozon that is
 * one `POST /v1/roles` per call, journalled like any other read; on
 * Wildberries nothing leaves the process.
 */
export const buildSyncPayload = async (
  deps: SyncPayloadDeps,
  adapters: readonly MarketplaceAdapter[],
) => {
  const now = deps.now ?? new Date();
  const marketplaces = await Promise.all(
    adapters.map((adapter) => buildSyncEntry(deps, adapter, now)),
  );

  return {
    marketplaces,
    warnings: syncWarnings(marketplaces),
    schedule: {
      cron: MP_SCHEDULER_CRON,
      stale_lock_ms: MP_STALE_LOCK_MS,
      expiry_warning_days: EXPIRY_WARNING_DAYS,
    },
    /** The server's own clock, so the screen counts «через сколько» from it. */
    now: now.toISOString(),
  };
};

export type SyncPayload = Awaited<ReturnType<typeof buildSyncPayload>>;

/**
 * The view of ONE marketplace: its entry and its own warnings, under the
 * same schedule and clock. Pure, so the unit test can hold it against the
 * full answer and prove the screen of one marketplace says the same thing
 * the screen of all of them does.
 */
export const syncViewOf = (payload: SyncPayload, marketplace: string) => {
  const entry = payload.marketplaces.find((candidate) => candidate.id === marketplace);
  if (!entry) {
    return null;
  }
  return {
    marketplace: entry,
    warnings: payload.warnings.filter((warning) => warning.marketplace === marketplace),
    schedule: payload.schedule,
    now: payload.now,
  };
};

export type SyncNowResult = {
  marketplace: string;
  kind: string;
  outcome: "started" | "skipped";
  /** `DueVerdict["reason"]`, or `no_key` / `integration_disabled` for a whole marketplace. */
  reason: string;
};

/**
 * Whether a run of this tenant is still going: a `running` row younger than
 * the stale-lock timeout, of any marketplace or of the one named. A crashed
 * process's abandoned lock does not count — `runOneSync` takes those over on
 * its own — or one dead run would lock the button forever
 * (w16-mp-scheduler-ops).
 */
export const syncInProgress = async (
  mp: Pick<MarketplaceModuleService, "listMpSyncRuns">,
  tenantId: string,
  now: Date,
  marketplace?: string,
): Promise<boolean> => {
  const runningRows = (await mp.listMpSyncRuns({
    tenant_id: tenantId,
    status: "running",
    ...(marketplace ? { marketplace } : {}),
  })) as SyncRunRow[];

  return runningRows.some((row) => {
    const startedAt = row.started_at instanceof Date ? row.started_at : new Date(row.started_at);
    return now.getTime() - startedAt.getTime() < MP_STALE_LOCK_MS;
  });
};

/**
 * «Обновить сейчас» for the given marketplaces (t-2026-09-24-n6, w6).
 *
 * Starts every connected marketplace's every kind AT ONCE, for this tenant
 * only, ignoring how long is left of each kind's normal interval. It does NOT
 * ignore a `running` lock, a marketplace's own rate-limit wait or a refused
 * key, because those are the marketplace's or the concurrency rule's own
 * refusal and not our pacing to override (`decideDue`, `force: true`,
 * `schedule.ts`).
 *
 * DOES NOT BLOCK ON THE SYNC ITSELF. `decideDue` answers which kinds may run
 * from a few cheap reads of `mp_sync_run`, no adapter call; the answer is
 * built from that alone, and each due kind is then handed to `runOneSync`
 * WITHOUT an `await`, so a rate-limit wait or a slow request never holds the
 * HTTP response open. A background failure is logged, never thrown back at a
 * request that has already answered.
 */
export const startSyncNow = async (
  deps: SchedulerDeps & { pg: unknown },
  adapters: readonly MarketplaceAdapter[],
): Promise<SyncNowResult[]> => {
  const results: SyncNowResult[] = [];

  for (const adapter of adapters) {
    const slot = await adapter.readCredentials(deps.pg, deps.tenantId);

    if (!slot || !slot.isEnabled) {
      results.push({
        marketplace: adapter.id,
        kind: "*",
        outcome: "skipped",
        reason: slot ? "integration_disabled" : "no_key",
      });
      continue;
    }

    const kinds = syncKindsOf(adapter).filter((kind) => MP_SCHEDULED_KINDS.includes(kind));

    for (const kind of kinds) {
      const { verdict } = await decideDue(deps, adapter, kind, slot.updatedAt ?? null, true);

      if (!verdict.due) {
        results.push({ marketplace: adapter.id, kind, outcome: "skipped", reason: verdict.reason });
        continue;
      }

      results.push({ marketplace: adapter.id, kind, outcome: "started", reason: verdict.reason });

      /**
       * Fire-and-forget on purpose (see the doc comment above): the response
       * has already promised this kind started, and awaiting it here would
       * hold the request open for exactly the rate-limit wait `force` is not
       * allowed to skip.
       */
      void runOneSync(deps, adapter, kind, slot.credentials, slot.updatedAt ?? null, true).catch(
        (error: unknown) => {
          deps.logger.error(
            `[mp-sync] «Обновить сейчас» ${adapter.id} ${kind}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }
  }

  return results;
};
