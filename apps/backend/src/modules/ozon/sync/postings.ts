import {
  type OzonSyncDeps,
  MAX_PAGES,
  asText,
  asDate,
  type OzonRunCounter,
  type OzonReader,
  type Upsert,
  upsertRows,
} from "./core";

/**
 * The postings import, Ozon's orders.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** `POST /v4/posting/fbs/list` and `/v3/posting/fbo/list`: limit [1..100]. */
const POSTINGS_PAGE = 100;

/**
 * Both posting lists cap the window at one year ("он должен быть не больше
 * одного года", and FBO answers PERIOD_IS_TOO_LONG beyond it). 180 days is
 * half of what Ozon allows, which is a window a first import can actually
 * finish; a longer history is a decision with a cost, not a default.
 */
const POSTINGS_WINDOW_DAYS = 180;

/** One posting, from either list, as a mirror row. */
const postingRow = (
  posting: Record<string, unknown>,
  scheme: "fbs" | "fbo",
  fetchedAt: Date,
): Upsert => ({
  keys: { posting_number: String(posting.posting_number) },
  values: {
    order_number: asText(posting.order_number),
    order_id: asText(posting.order_id),
    scheme,
    status: asText(posting.status),
    substatus: asText(posting.substatus),
    products: posting.products ?? null,
    analytics_data: posting.analytics_data ?? null,
    financial_data: posting.financial_data ?? null,
    // v3 FBO sends `created_at`; v4 FBS does not, and its own earliest stamp
    // is `in_process_at`. Read both, invent neither.
    posting_created_at: asDate(posting.created_at),
    in_process_at: asDate(posting.in_process_at),
    cancel_reason_id: asText(posting.cancel_reason_id),
    source: "ozon",
    fetched_at: fetchedAt,
    raw: posting,
  },
});

/**
 * `POST /v4/posting/fbs/list` and `POST /v3/posting/fbo/list`, both
 * cursor-paginated over a bounded window.
 */
export const syncPostings = async (
  deps: OzonSyncDeps,
  read: OzonReader,
  counter: OzonRunCounter,
): Promise<void> => {
  type Answer = { postings?: Array<Record<string, unknown>>; cursor?: string; has_next?: boolean };

  const since = new Date(Date.now() - POSTINGS_WINDOW_DAYS * 86_400_000).toISOString();
  const to = new Date().toISOString();

  for (const [endpointId, scheme] of [
    ["posting.fbs.list", "fbs"],
    ["posting.fbo.list", "fbo"],
  ] as const) {
    let cursor = "";

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await read<Answer>(endpointId, {
        body: {
          cursor,
          filter: { since, to },
          limit: POSTINGS_PAGE,
          sort_dir: "ASC",
          with: { analytics_data: true, financial_data: true },
        },
      });

      const postings = answer.postings ?? [];
      if (!postings.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.ozon,
        "OzonPosting",
        deps.tenantId,
        postings
          .filter((posting) => Boolean(posting.posting_number))
          .map((posting) => postingRow(posting, scheme, fetchedAt)),
      );

      deps.logger.info(
        `[ozon] postings ${scheme} page ${page + 1}: ${postings.length} shipments since ${since}`,
      );

      const next = answer.cursor ?? "";
      if (answer.has_next !== true || !next || next === cursor) {
        break;
      }
      cursor = next;
    }
  }
};
