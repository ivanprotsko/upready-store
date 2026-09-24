import { MARKETPLACES } from "./registry";

/**
 * WHEN each kind of each marketplace is due, and when a lock is stale
 * (w16-mp-scheduler-ops, spec 2.6).
 *
 * PURE. Nothing here opens a socket or touches the database: it is the policy
 * the job and the screen both read, and the reason both agree about what
 * «следующий запуск» means. The I/O lives in `scheduler.ts`.
 *
 * THE INTERVALS ARE ONE NAMED MAP, not literals scattered over the job. The
 * spec sets them per FAMILY — cards and prices hourly, stocks every 15 min,
 * orders every 10 min, reviews and questions every 30 min, analytics daily —
 * and the adapters speak their own vocabularies for those families (WB imports
 * `cards`, Ozon imports `products`). So the map is family -> interval, and a
 * second map says which family an adapter kind belongs to. A kind nobody
 * placed turns `__tests__/schedule.unit.spec.ts` red, because that test takes
 * its list from `MARKETPLACES` rather than from a copy: registering a third
 * marketplace makes the suite ask for its intervals instead of letting the new
 * kinds run on a default nobody chose (rule 20).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The families the spec sets an interval for. */
export const MP_SYNC_FAMILIES = [
  "cards",
  "prices",
  "stocks",
  "orders",
  "feedback",
  "analytics",
  "projection",
] as const;
export type MpSyncFamily = (typeof MP_SYNC_FAMILIES)[number];

/**
 * How often each family is imported, in milliseconds (spec 2.6).
 *
 * `projection` is this repository's own family and is not in the spec's list.
 * It recomputes the normalized `mp_*` layer from mirrors already on disk, so
 * it spends ZERO marketplace requests; it is set to the shortest import
 * interval of them all, because every screen reads the normalized layer and a
 * projection that lags turns a fresh import into a stale screen.
 */
export const MP_SYNC_INTERVAL_MS: Readonly<Record<MpSyncFamily, number>> = {
  cards: 1 * HOUR,
  prices: 1 * HOUR,
  stocks: 15 * MINUTE,
  orders: 10 * MINUTE,
  feedback: 30 * MINUTE,
  analytics: 24 * HOUR,
  projection: 10 * MINUTE,
};

/**
 * Which family an adapter's own kind belongs to.
 *
 * Wildberries and Ozon name the same things differently (`cards` / `products`,
 * `orders` / `postings`, `feedbacks` / `reviews`), which is exactly why the
 * intervals are set per family and mapped here rather than per kind.
 *
 * Two WB kinds are worth naming out loud. `sales` and `orders` both come from
 * WB's statistics category, whose limit on a base token is documented as one
 * request per three hours and was measured asking for 10 524 s; they are still
 * scheduled at the spec's ten minutes, because a run that meets a 429 ends as
 * `rate_limited` carrying WB's own `retry_at`, and `nextDueAt` below refuses
 * to start the kind again before that moment. The interval decides how often
 * we LOOK; the marketplace decides when we may READ.
 */
export const MP_KIND_FAMILY: Readonly<Record<string, MpSyncFamily>> = {
  // Wildberries (`modules/wb/models/wb-sync-run.ts`).
  cards: "cards",
  prices: "prices",
  stocks: "stocks",
  orders: "orders",
  sales: "orders",
  feedbacks: "feedback",
  questions: "feedback",
  analytics: "analytics",
  supplies: "orders",
  fbs_orders: "orders",
  // Ozon (`modules/ozon/models/ozon-sync-run.ts`). `prices`, `stocks` and
  // `questions` are spelled the same and are already placed above.
  products: "cards",
  postings: "orders",
  reviews: "feedback",
  // The core's own kind, written by `project.ts`.
  projection: "projection",
};

/** The kind every adapter of the registry imports, plus the core's projection. */
export const MP_SCHEDULED_KINDS: readonly string[] = [
  ...new Set([...MARKETPLACES.flatMap((adapter) => [...adapter.syncKinds]), "projection"]),
];

/**
 * How long a `running` row may stand before another process may take the kind
 * over, in milliseconds.
 *
 * WHY THIRTY MINUTES. A `running` row IS the lock (`scheduler.ts`), so a
 * process killed mid-run would park its kind forever without a timeout. The
 * number has to sit above every run that is still alive and below the point
 * where a dead lock costs the owner data:
 *
 *   - measured on the local stand (`upready_store_w16`, 35 runs carried from
 *     the w12 acceptance), the LONGEST finished run took 32 s: `wb.stocks`,
 *     11 605 rows. Thirty minutes is 56 times that;
 *   - the theoretical ceiling of one run is bounded too: the longest per-request
 *     timeout in either registry is 120 s (`statistics.orders`), and one 429
 *     wait is capped at 30 s by `backoff.ts`, so a request and its retries
 *     cannot exceed about 7.5 min. A run that has been "running" for half an
 *     hour has stopped being a run;
 *   - it is three times the SHORTEST interval (10 min), so a takeover happens
 *     on the third tick rather than racing a run that is merely slow.
 *
 * The takeover is not silent: the stale row is closed as `failed` with the
 * timeout named in its error, so a crashed process leaves a visible row rather
 * than a gap (rule 20a).
 */
export const MP_STALE_LOCK_MS = 30 * MINUTE;

/**
 * How often the job itself wakes up. It must be no longer than the shortest
 * interval, or a 10-minute kind would run every 15.
 */
export const MP_SCHEDULER_CRON = "*/5 * * * *";

/** The interval of one adapter kind, or `null` when no family claims it. */
export const intervalMsFor = (kind: string): number | null => {
  const family = MP_KIND_FAMILY[kind];
  return family ? MP_SYNC_INTERVAL_MS[family] : null;
};

/** The shape `nextDueAt` needs out of the newest `mp_sync_run` row of a triple. */
export type LastRun = {
  status: string;
  started_at: Date;
  finished_at: Date | null;
  retry_at?: Date | null;
  /**
   * How many runs in a row, this one included, ended `failed` or
   * `auth_failed` (`consecutiveFailures`). Absent = one.
   */
  consecutive_failures?: number;
};

/**
 * A run the marketplace refused for its KEY: HTTP 401 or 403 on the call that
 * broke it (`scheduler.ts` reads the status from the transport journal). Kept
 * apart from `failed` because retrying it cannot help until the owner fixes
 * the key (audit 2026-09-23, C-01).
 */
export const MP_AUTH_FAILED = "auth_failed";

/** The statuses that count as a failure for the backoff. */
export const MP_FAILURE_STATUSES: readonly string[] = ["failed", MP_AUTH_FAILED];

/** The longest a failing kind waits between two tries: six hours. */
export const MP_FAILURE_BACKOFF_CAP_MS = 6 * HOUR;

/**
 * How long an `auth_failed` kind waits when its key has NOT changed since the
 * run: the same six hours, so a key the marketplace refused by mistake heals
 * without the owner, at four requests a day instead of one every interval.
 */
export const MP_AUTH_FAILED_RETRY_MS = MP_FAILURE_BACKOFF_CAP_MS;

/** Consecutive failures at the head of a triple's runs, newest first. */
export const consecutiveFailures = (runsNewestFirst: readonly { status: string }[]): number => {
  let count = 0;
  for (const run of runsNewestFirst) {
    if (!MP_FAILURE_STATUSES.includes(run.status)) {
      break;
    }
    count += 1;
  }
  return count;
};

/**
 * The wait after a failed run: the kind's own interval, doubled for every
 * further failure in a row, capped at six hours. The first failure waits
 * exactly the interval, as every failure did before.
 */
export const failureBackoffMs = (interval: number, consecutive: number): number =>
  Math.min(interval * 2 ** Math.max(0, consecutive - 1), Math.max(interval, MP_FAILURE_BACKOFF_CAP_MS));

export type DueVerdict = {
  due: boolean;
  /** One of the reasons below. The screen and the log both print it. */
  reason:
    | "never_ran"
    | "interval_elapsed"
    | "stale_lock_taken_over"
    | "locked"
    | "waiting"
    | "forced";
  /** When this triple may run next. `null` when it may run now. */
  nextAt: Date | null;
};

/** Whether a `running` row has stood longer than a run can live. */
export const isStaleLock = (run: LastRun, now: Date): boolean =>
  run.status === "running" && now.getTime() - run.started_at.getTime() >= MP_STALE_LOCK_MS;

/**
 * Whether this triple may start now, and if not, when.
 *
 * FOUR states, not two. A kind that has never run is due immediately; a kind
 * whose run is still going is locked; a kind the marketplace rate-limited is
 * WAITING until the window the marketplace itself named, which is neither our
 * defect nor a reason to spend another request; everything else waits out its
 * interval. Flattening "waiting" into "not due" would lose the only number
 * that tells the owner when the data comes (w03's acceptance lesson).
 */
export const nextDueAt = (
  last: LastRun | null,
  kind: string,
  now: Date,
  /**
   * When the tenant's key for this marketplace was last written
   * (`tenant_integration_secret.updated_at`). Only an `auth_failed` run reads
   * it: a key saved after the refused run is a new key and is tried at once.
   */
  credentialsUpdatedAt?: Date | null,
  /**
   * «Обновить сейчас» (w6-mp-orders-sync-now): the owner's own request to
   * import now, ignoring how long is left of the normal or the backed-off
   * interval. It does NOT ignore a `running` lock, a marketplace's own
   * rate-limit wait or a refused key — those are the marketplace's or the
   * concurrency rule's own refusal, not this triple's interval, and forcing
   * past them would spend a request the marketplace has already said no to.
   */
  force = false,
): DueVerdict => {
  if (!last) {
    return { due: true, reason: "never_ran", nextAt: null };
  }

  if (last.status === "running") {
    if (isStaleLock(last, now)) {
      return { due: true, reason: "stale_lock_taken_over", nextAt: null };
    }
    return {
      due: false,
      reason: "locked",
      nextAt: new Date(last.started_at.getTime() + MP_STALE_LOCK_MS),
    };
  }

  if (last.status === "rate_limited" && last.retry_at && last.retry_at.getTime() > now.getTime()) {
    return { due: false, reason: "waiting", nextAt: last.retry_at };
  }

  /**
   * A refused key (audit 2026-09-23, C-01). Retrying it every interval spends
   * requests the marketplace has already answered and can get the key banned,
   * so the kind waits for the owner to save a new key, or six hours.
   */
  if (last.status === MP_AUTH_FAILED) {
    if (credentialsUpdatedAt && credentialsUpdatedAt.getTime() > last.started_at.getTime()) {
      return { due: true, reason: "interval_elapsed", nextAt: null };
    }
    const retryAt = new Date(last.started_at.getTime() + MP_AUTH_FAILED_RETRY_MS);
    return retryAt.getTime() <= now.getTime()
      ? { due: true, reason: "interval_elapsed", nextAt: null }
      : { due: false, reason: "waiting", nextAt: retryAt };
  }

  /**
   * Past the lock, the rate limit and a refused key, `force` is «Обновить
   * сейчас» itself: the owner asked for this kind regardless of its interval
   * or its failure backoff, and both are OUR pacing, not the marketplace's.
   */
  if (force) {
    return { due: true, reason: "forced", nextAt: null };
  }

  /**
   * The interval counts from the START of the last run, not from its end: the
   * question is "how often does this data refresh", and measuring from the end
   * would stretch every interval by however long the import took.
   */
  const interval = intervalMsFor(kind);
  if (interval === null) {
    /**
     * A kind no family claims. It is NOT scheduled — better a kind that never
     * runs by itself, and says so on the screen, than one running on an
     * interval nobody chose. The suite fails on this case for every registered
     * adapter, so reaching it means a kind arrived without its interval.
     */
    return { due: false, reason: "waiting", nextAt: null };
  }

  /**
   * A failed run waits longer each time it fails again (audit 2026-09-23,
   * C-01): before, a broken kind was retried every interval forever, exactly
   * like a healthy one.
   */
  const wait =
    last.status === "failed"
      ? failureBackoffMs(interval, last.consecutive_failures ?? 1)
      : interval;

  const nextAt = new Date(last.started_at.getTime() + wait);
  return nextAt.getTime() <= now.getTime()
    ? { due: true, reason: "interval_elapsed", nextAt: null }
    : { due: false, reason: "waiting", nextAt };
};
