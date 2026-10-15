import type { Logger } from "@medusajs/framework/types";
import { chunk, pagesOf, type PagedList } from "../../marketplace/batch";
import type WbModuleService from "../service";
import type { WbSyncKind } from "../models/wb-sync-run";
import { wbRead, type WbApiCallRecord } from "../transport";

/**
 * What every import shares: its dependencies and limits, the reader that
 * counts requests, the value readers, and the batched mirror upsert.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/**
 * What an operator may narrow for one run (w03-wb-sales-questions-mirror).
 * Only the analytics import takes anything, because it is the one WB caps at
 * 20 listings per request: the operator can name the listings instead of
 * accepting the ranking below.
 */
export type WbSyncLimits = {
  /** How many listings the analytics import covers in one run. */
  analyticsCards?: number;
  /** Exactly these WB numbers, instead of the ranking. */
  nmIds?: string[];
  /**
   * Which half of the questions to import, when only one of them is worth a
   * request. `isAnswered` is a required WB parameter, so the import normally
   * makes both passes — and on a base token the whole Feedbacks and Questions
   * category shares 5 requests per hour (measured 2026-09-16 05:13 and 05:20
   * WITA: WB answered 429 asking for 720 s and then 266 s). With two passes
   * the first one always spends the budget, so an operator who needs the
   * other half has to be able to say so.
   */
  questionsAnswered?: boolean;
};

export type WbSyncDeps = {
  wb: WbModuleService;
  tenantId: string;
  token: string;
  logger: Pick<Logger, "info" | "warn" | "error">;
  limits?: WbSyncLimits;
};

export type WbSyncOutcome = {
  kind: WbSyncKind;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "rate_limited" | "failed";
  error: string | null;
  /** Set only for `rate_limited`: when WB said this kind may be read again. */
  retryAt: Date | null;
};

/** Guard against a cursor that stops moving: never loop forever on WB's answer. */
export const MAX_PAGES = 200;

export const asText = (value: unknown): string | null =>
  value === undefined || value === null || value === "" ? null : String(value);

export const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const asDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * What one run has done so far.
 *
 * Rows are counted HERE and not in a local variable inside each import,
 * because an import can fail halfway: WB's rate limits are per category and a
 * 429 arrives mid-pagination. A run that wrote 123 feedbacks and then hit a
 * 429 must report 123, not 0 (measured on the first live run, 2026-09-16
 * 04:13 WITA: `wb_feedback` held 123 rows while its run row said
 * `failed, 0 rows` — rule 20a, a zero that is not empty).
 */
export type WbRunCounter = { requests: number; rows: number };

/**
 * One `wbRead` bound to this run: the tenant, the key, the run id and the
 * journal writer are the same for every request the run makes, and the caller
 * only ever names an endpoint.
 */
export const readerFor = (deps: WbSyncDeps, runId: string, counter: WbRunCounter) => {
  const journal = async (entry: WbApiCallRecord) => {
    await deps.wb.createWbApiCalls(entry);
  };

  return async <T>(
    endpointId: string,
    options: {
      params?: Record<string, string | number>;
      query?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> => {
    counter.requests += 1;
    const result = await wbRead<T>(endpointId, {
      token: deps.token,
      tenantId: deps.tenantId,
      syncRunId: runId,
      params: options.params,
      query: options.query as
        | Record<string, string | number | boolean | undefined | null>
        | undefined,
      body: options.body,
      journal,
      logger: deps.logger,
    });
    return result.data;
  };
};

export type WbReader = ReturnType<typeof readerFor>;

export type Upsert = { keys: Record<string, unknown>; values: Record<string, unknown> };

export type MirrorEntity =
  | "WbProduct"
  | "WbPrice"
  | "WbStock"
  | "WbOrder"
  | "WbSale"
  | "WbFeedback"
  | "WbQuestion"
  | "WbAnalyticsDaily"
  | "WbFbsOrder"
  | "WbSupply";

/**
 * The plural `MedusaService` builds each model's methods from, written out
 * instead of appended as an "s" (w03-wb-sales-questions-mirror).
 *
 * The framework pluralizes the model name, and English pluralization is not
 * concatenation: `WbAnalyticsDaily` becomes `listWbAnalyticsDailies`, so
 * `list${entity}s` would call a method that does not exist and fail at the
 * first row rather than at boot. `__tests__/service-methods.unit.spec.ts`
 * checks every name in this map against the real service.
 */
export const MIRROR_PLURAL: Record<MirrorEntity, string> = {
  WbProduct: "WbProducts",
  WbPrice: "WbPrices",
  WbStock: "WbStocks",
  WbOrder: "WbOrders",
  WbSale: "WbSales",
  WbFeedback: "WbFeedbacks",
  WbQuestion: "WbQuestions",
  WbAnalyticsDaily: "WbAnalyticsDailies",
  // w23: `WbSupply` pluralises to `WbSupplies`, which is exactly why this map
  // exists — `list${entity}s` would have called `listWbSupplys`.
  WbFbsOrder: "WbFbsOrders",
  WbSupply: "WbSupplies",
};

/** One generated `list…` method of the module service, shaped for a paged read. */
export const pagedList = <Row>(wb: WbModuleService, entity: MirrorEntity): PagedList<Row> => {
  const service = wb as unknown as Record<string, (...input: unknown[]) => Promise<unknown>>;
  return service[`list${MIRROR_PLURAL[entity]}`].bind(wb) as unknown as PagedList<Row>;
};

/**
 * Writes the mirror rows of one answer through the module service. Existing
 * rows are matched on the model's own unique key inside this tenant, so a
 * second run of the same import updates and never duplicates.
 *
 * NO CALL CARRIES MORE THAN `MP_BATCH_SIZE` ROWS OR KEYS (t-2026-10-06-21).
 * The statistics feed answers with everything that changed in its window in
 * one array, 25 597 orders on 2026-10-06, and this function used to hand that
 * array to the service whole. The lookup then loaded every matched row with
 * its `raw` answer, and `update` loaded them all a second time by a chain of
 * one `id = ?` per row. Both are now asked a batch at a time, and the lookup
 * reads the id and the key columns only, which is all it compares.
 *
 * The ids are resolved for the whole answer BEFORE the first write, exactly as
 * the single lookup did, so which row is created and which is updated does not
 * depend on where a batch happens to end.
 */
export const upsertRows = async (
  wb: WbModuleService,
  entity: MirrorEntity,
  tenantId: string,
  rows: Upsert[],
): Promise<number> => {
  if (!rows.length) {
    return 0;
  }

  const service = wb as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const plural = MIRROR_PLURAL[entity];
  const list = pagedList<Record<string, unknown> & { id: string }>(wb, entity);
  const create = service[`create${plural}`].bind(wb);
  const update = service[`update${plural}`].bind(wb);

  const keyNames = Object.keys(rows[0].keys);
  const keyOf = (source: Record<string, unknown>) =>
    keyNames.map((name) => String(source[name])).join(" ");

  const byKey = new Map<string, string>();
  for (const batch of chunk(rows)) {
    const filter = {
      tenant_id: tenantId,
      ...Object.fromEntries(
        keyNames.map((name) => [name, [...new Set(batch.map((row) => row.keys[name]))]]),
      ),
    };
    for await (const page of pagesOf(list, filter, ["id", ...keyNames])) {
      for (const row of page) {
        byKey.set(keyOf(row), row.id);
      }
    }
  }

  const toCreate = new Map<string, Record<string, unknown>>();
  const toUpdate: Record<string, unknown>[] = [];

  /**
   * One ANSWER can carry the same key twice (w03: WB's sales feed repeats an
   * `srid` when it holds both the sale and its return). Matching against the
   * rows already in the database is not enough for that: neither copy exists
   * yet, both land in the insert, and the batch dies on the unique index with
   * "already exists" after writing nothing at all — which is what happened on
   * the first live sales run, 2026-09-16 05:12 WITA.
   *
   * So the batch is deduplicated against ITSELF too, keeping the later row:
   * WB sends its pages newest-first, and within one page the later copy is the
   * one it wants us to end on.
   */
  for (const row of rows) {
    const key = keyOf(row.keys);
    const id = byKey.get(key);
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.set(key, { tenant_id: tenantId, ...row.keys, ...row.values });
    }
  }

  for (const batch of chunk([...toCreate.values()])) {
    await create(batch);
  }
  for (const batch of chunk(toUpdate)) {
    await update(batch);
  }

  return toCreate.size + toUpdate.length;
};
