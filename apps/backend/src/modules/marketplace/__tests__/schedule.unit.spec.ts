import { MARKETPLACES } from "../registry";
import {
  MP_KIND_FAMILY,
  MP_SCHEDULED_KINDS,
  MP_SCHEDULER_CRON,
  MP_STALE_LOCK_MS,
  MP_SYNC_INTERVAL_MS,
  intervalMsFor,
  isStaleLock,
  nextDueAt,
} from "../schedule";

/**
 * THE SCHEDULE POLICY (w16-mp-scheduler-ops, spec 2.6).
 *
 * The first block is the one that matters for the third marketplace: it takes
 * its list of kinds from `MARKETPLACES`, so registering an adapter puts its
 * kinds under this test WITHOUT the file being edited. A kind that arrives
 * without an interval turns the suite red instead of quietly running on a
 * default nobody chose (rule 20).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("the interval map covers every registered kind", () => {
  const kinds = [...MARKETPLACES.flatMap((adapter) => [...adapter.syncKinds]), "projection"];

  it("names at least the two adapters this repository registers", () => {
    expect(MARKETPLACES.map((adapter) => adapter.id).sort()).toEqual(["ozon", "wb"]);
    expect(kinds.length).toBeGreaterThan(10);
  });

  it.each(kinds)("places %s in a family with an interval", (kind) => {
    expect(MP_KIND_FAMILY[kind]).toBeDefined();
    expect(intervalMsFor(kind)).toBeGreaterThan(0);
  });

  it("schedules exactly the kinds the registry knows, deduplicated", () => {
    expect([...MP_SCHEDULED_KINDS].sort()).toEqual([...new Set(kinds)].sort());
  });

  it("schedules nothing the registry does not know", () => {
    expect(intervalMsFor("teleport")).toBeNull();
    expect(nextDueAt(null, "teleport", new Date()).due).toBe(true);
  });
});

describe("the intervals are the spec's", () => {
  it("cards and prices hourly, stocks 15 min, orders 10 min, feedback 30 min, analytics daily", () => {
    expect(MP_SYNC_INTERVAL_MS.cards).toBe(HOUR);
    expect(MP_SYNC_INTERVAL_MS.prices).toBe(HOUR);
    expect(MP_SYNC_INTERVAL_MS.stocks).toBe(15 * MINUTE);
    expect(MP_SYNC_INTERVAL_MS.orders).toBe(10 * MINUTE);
    expect(MP_SYNC_INTERVAL_MS.feedback).toBe(30 * MINUTE);
    expect(MP_SYNC_INTERVAL_MS.analytics).toBe(24 * HOUR);
  });

  it("maps the two vocabularies onto the same families", () => {
    // WB imports `cards`, Ozon imports `products`, and they refresh together.
    expect(intervalMsFor("cards")).toBe(intervalMsFor("products"));
    expect(intervalMsFor("orders")).toBe(intervalMsFor("postings"));
    expect(intervalMsFor("feedbacks")).toBe(intervalMsFor("reviews"));
  });

  it("wakes up no less often than the shortest interval", () => {
    const everyMinutes = Number(MP_SCHEDULER_CRON.split(" ")[0].replace("*/", ""));
    const shortest = Math.min(...Object.values(MP_SYNC_INTERVAL_MS));
    expect(everyMinutes * MINUTE).toBeLessThanOrEqual(shortest);
  });
});

describe("nextDueAt", () => {
  const now = new Date("2026-09-16T10:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("a kind that has never run is due immediately", () => {
    expect(nextDueAt(null, "stocks", now)).toEqual({
      due: true,
      reason: "never_ran",
      nextAt: null,
    });
  });

  it("a run still going locks the kind, and says until when", () => {
    const verdict = nextDueAt(
      { status: "running", started_at: ago(2 * MINUTE), finished_at: null },
      "stocks",
      now,
    );
    expect(verdict.due).toBe(false);
    expect(verdict.reason).toBe("locked");
    expect(verdict.nextAt?.getTime()).toBe(ago(2 * MINUTE).getTime() + MP_STALE_LOCK_MS);
  });

  it("a lock older than the timeout is taken over", () => {
    const stale = { status: "running", started_at: ago(MP_STALE_LOCK_MS + 1), finished_at: null };
    expect(isStaleLock(stale, now)).toBe(true);
    expect(nextDueAt(stale, "stocks", now)).toEqual({
      due: true,
      reason: "stale_lock_taken_over",
      nextAt: null,
    });
  });

  it("a rate-limited run waits for the marketplace's own window, not for our interval", () => {
    // Ten-minute kind, rate limited three hours out: the interval says «due»,
    // the marketplace says «not yet», and the marketplace wins (w03's lesson).
    const retryAt = new Date(now.getTime() + 3 * HOUR);
    const verdict = nextDueAt(
      {
        status: "rate_limited",
        started_at: ago(2 * HOUR),
        finished_at: ago(2 * HOUR),
        retry_at: retryAt,
      },
      "orders",
      now,
    );
    expect(verdict).toEqual({ due: false, reason: "waiting", nextAt: retryAt });
  });

  it("a rate-limited run whose window has opened is due again", () => {
    const verdict = nextDueAt(
      {
        status: "rate_limited",
        started_at: ago(3 * HOUR),
        finished_at: ago(3 * HOUR),
        retry_at: ago(MINUTE),
      },
      "orders",
      now,
    );
    expect(verdict.due).toBe(true);
    expect(verdict.reason).toBe("interval_elapsed");
  });

  it("counts the interval from the START of the last run", () => {
    // Started 11 minutes ago, took 3: an interval measured from the end would
    // still be waiting, and every ten-minute kind would drift to thirteen.
    const verdict = nextDueAt(
      {
        status: "succeeded",
        started_at: ago(11 * MINUTE),
        finished_at: ago(8 * MINUTE),
      },
      "orders",
      now,
    );
    expect(verdict).toEqual({ due: true, reason: "interval_elapsed", nextAt: null });
  });

  it("a fresh success waits out its interval and names the moment", () => {
    const verdict = nextDueAt(
      { status: "succeeded", started_at: ago(4 * MINUTE), finished_at: ago(3 * MINUTE) },
      "orders",
      now,
    );
    expect(verdict.due).toBe(false);
    expect(verdict.reason).toBe("waiting");
    expect(verdict.nextAt?.toISOString()).toBe("2026-09-16T10:06:00.000Z");
  });

  it("a failed run is retried on the interval, not held back", () => {
    const verdict = nextDueAt(
      {
        status: "failed",
        started_at: ago(20 * MINUTE),
        finished_at: ago(20 * MINUTE),
      },
      "stocks",
      now,
    );
    expect(verdict.due).toBe(true);
  });
});
