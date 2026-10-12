/**
 * t-2026-10-12-31: `metadata.live === true` says the shop accepts real
 * visitors. Ivan's words of 12.10.2026: «сделать явный флаг, по которому агенты
 * будут понимать, что проект уже принимает реальных посетителей». Until it is
 * true, the shop's orders and buyers are test data, and agents and reports
 * treat them as such.
 *
 * Three keys, the same three the project canon of ivanprotsko/devops uses:
 *   `live`        boolean, a missing key reads as `false`
 *   `live_since`  ISO date (YYYY-MM-DD) of the last switch, the day from which
 *                 the current value of `live` holds
 *   `live_by`     who made that switch, `ivan`
 *
 * Only Ivan switches it, with `deploy/scripts/tenant-live.mjs` against the
 * host's database (docs/instances/RULES.md §7, live flag). `POST
 * /admin/tenants/:id` refuses all three keys, so no API token sets it.
 *
 * Not `test_shop` (`test-shop.ts`): that one marks a dev fixture such as acme
 * or globex. A real shop is `test_shop` false and can still be not live.
 */
export const LIVE_METADATA_KEY = "live";
export const LIVE_SINCE_METADATA_KEY = "live_since";
export const LIVE_BY_METADATA_KEY = "live_by";

export const LIVE_METADATA_KEYS = [LIVE_METADATA_KEY, LIVE_SINCE_METADATA_KEY, LIVE_BY_METADATA_KEY] as const;

export type LiveState = {
  live: boolean;
  live_since: string | null;
  live_by: string | null;
};

const record = (metadata: unknown): Record<string, unknown> | null =>
  metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/** Only the JSON boolean `true` counts. A string "true", a 1 or a missing key is not live. */
export const isLive = (metadata: unknown): boolean => record(metadata)?.[LIVE_METADATA_KEY] === true;

export const readLive = (metadata: unknown): LiveState => {
  const fields = record(metadata);
  return {
    live: isLive(metadata),
    live_since: text(fields?.[LIVE_SINCE_METADATA_KEY]),
    live_by: text(fields?.[LIVE_BY_METADATA_KEY]),
  };
};
