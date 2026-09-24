import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { EXPIRY_WARNING_DAYS } from "../../../../modules/marketplace/contract";
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace";
import { MARKETPLACES } from "../../../../modules/marketplace/registry";
import {
  MP_FAILURE_STATUSES,
  MP_SCHEDULED_KINDS,
  MP_SCHEDULER_CRON,
  MP_STALE_LOCK_MS,
  consecutiveFailures,
  intervalMsFor,
  nextDueAt,
} from "../../../../modules/marketplace/schedule";
import { decideDue, runOneSync, type SchedulerDeps } from "../../../../modules/marketplace/scheduler";
import type MarketplaceModuleService from "../../../../modules/marketplace/service";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/marketplaces/sync` — the «Синхронизация» screen
 * (w16-mp-scheduler-ops, spec 2.6 and 2.7).
 *
 * ONE ROW PER (MARKETPLACE, KIND), for every marketplace at once. The card
 * screen answers "what is this marketplace", this one answers "is the data
 * fresh, and if not, why" — and it is built so that the second question can be
 * answered NEGATIVELY:
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
 *
 * It ASKS each key what it may do, unlike the list route: the expiry warning
 * is the point of the screen, and a cached answer would age. On Ozon that is
 * one `POST /v1/roles` per marketplace, journalled like any other read.
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

type RunRow = {
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

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const now = new Date();

  const marketplaces = await Promise.all(
    MARKETPLACES.map(async (adapter) => {
      const slot = await adapter.readCredentials(pg, tenant.id);

      const facts = await adapter.inspectCredentials(slot?.credentials ?? null, {
        tenantId: tenant.id,
        /**
         * Asking an Ozon key what it may do IS a request to Ozon, and the
         * shared journal is what proves what left this process. `medusa lint`
         * warns about a service mutation in a route handler and the warning is
         * kept on purpose, exactly as `status-payload.ts` keeps it: this is one
         * bookkeeping row about a request this handler itself sent, and it has
         * to be written by whoever sent it or the evidence goes missing.
         */
        journal: async (entry) => {
          await mp.createMpApiCalls({ ...entry, marketplace: adapter.id });
        },
      });

      /**
       * Two hundred runs is far more than the screen shows, and it is what
       * lets «последняя ошибка» and «последний успех» be answered per kind
       * without one query per kind per fact.
       */
      const runs = (await mp.listMpSyncRuns(
        { tenant_id: tenant.id, marketplace: adapter.id },
        { order: { started_at: "DESC" }, take: 200 },
      )) as RunRow[];

      const kinds = [...adapter.syncKinds, "projection"].map((kind) => {
        const ofKind = runs.filter((run) => run.kind === kind);
        const newest = ofKind[0] ?? null;
        const lastSuccess = ofKind.find((run) => run.status === "succeeded") ?? null;
        const lastFailure =
          ofKind.find((run) => MP_FAILURE_STATUSES.includes(run.status)) ?? null;
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
    }),
  );

  /**
   * WHAT needs attention, decided once here rather than in the panel: the rule
   * has to be one rule, and a second copy written in TSX would drift from this
   * one. WHAT IT READS LIKE is the panel's job — the fields below carry the
   * marketplace label, the kind id and the error, and the screen puts them
   * into a sentence with the kind in plain language («Карточки товаров», not
   * `cards`) and the locale the owner chose (rule 18e).
   *
   * `text` stays as the ready-made Russian sentence for a consumer that has no
   * catalog of its own: an alert, a digest, a report.
   */
  const warnings = marketplaces.flatMap((entry) => {
    type Warning = {
      marketplace: string;
      marketplace_label: string;
      kind: string | null;
      type: string;
      expires_at?: string | null;
      expires_in_days?: number | null;
      error?: string | null;
      text: string;
    };
    const found: Warning[] = [];
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

  res.json({
    marketplaces,
    warnings,
    schedule: {
      cron: MP_SCHEDULER_CRON,
      stale_lock_ms: MP_STALE_LOCK_MS,
      expiry_warning_days: EXPIRY_WARNING_DAYS,
    },
    /** The server's own clock, so the screen counts «через сколько» from it. */
    now: now.toISOString(),
  });
};

export type SyncNowResult = {
  marketplace: string;
  kind: string;
  outcome: "started" | "skipped";
  /** `DueVerdict["reason"]`, or `no_key` / `integration_disabled` for a whole marketplace. */
  reason: string;
};

/**
 * `POST /tenants/marketplaces/sync` — «Обновить сейчас» (t-2026-09-24-n6).
 *
 * Ivan, 2026-09-24: after saving a key the owner had no way to ask for the
 * first import without waiting for the scheduler's own tick, up to ten
 * minutes away for orders and up to an hour for cards and prices. This starts
 * every connected marketplace's every kind AT ONCE, for THIS tenant only,
 * ignoring how long is left of each kind's normal interval — it does NOT
 * ignore a `running` lock, a marketplace's own rate-limit wait or a refused
 * key, because those are the marketplace's or the concurrency rule's own
 * refusal and not our pacing to override (`decideDue`, `force: true`,
 * `schedule.ts`).
 *
 * DOES NOT BLOCK ON THE SYNC ITSELF. `decideDue` answers which kinds may run
 * from a few cheap reads of `mp_sync_run`, no adapter call; the response is
 * built from that alone, and each due kind is then handed to `runOneSync`
 * WITHOUT an `await`, so a rate-limit wait or a slow request never holds the
 * HTTP response open. A background failure is logged, never thrown back at a
 * request that has already answered.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const now = new Date();

  /**
   * «Уже идёт», tenant-wide: any kind of any marketplace still inside a
   * `running` row younger than the stale-lock timeout. A crashed process's
   * abandoned lock does not count — `runOneSync` takes those over on its own
   * — or one dead run would lock this button forever (w16-mp-scheduler-ops).
   */
  const runningRows = (await mp.listMpSyncRuns({
    tenant_id: tenant.id,
    status: "running",
  })) as RunRow[];

  const stillRunning = runningRows.some((row) => {
    const startedAt = row.started_at instanceof Date ? row.started_at : new Date(row.started_at);
    return now.getTime() - startedAt.getTime() < MP_STALE_LOCK_MS;
  });

  if (stillRunning) {
    res.status(409).json({
      type: "sync_in_progress",
      message: "Обмен уже идёт для этого магазина — дождитесь, пока текущий прогон закончится.",
    });
    return;
  }

  const deps: SchedulerDeps = { container: req.scope, tenantId: tenant.id, logger };
  const results: SyncNowResult[] = [];

  for (const adapter of MARKETPLACES) {
    const slot = await adapter.readCredentials(pg, tenant.id);

    if (!slot || !slot.isEnabled) {
      results.push({
        marketplace: adapter.id,
        kind: "*",
        outcome: "skipped",
        reason: slot ? "integration_disabled" : "no_key",
      });
      continue;
    }

    const kinds = [...adapter.syncKinds, "projection"].filter((kind) =>
      MP_SCHEDULED_KINDS.includes(kind),
    );

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
          logger.error(
            `[mp-sync] «Обновить сейчас» ${adapter.id} ${kind}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }
  }

  res.json({ results, now: now.toISOString() });
};
