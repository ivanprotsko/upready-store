import type { Logger } from "@medusajs/framework/types";
import { chunk, pagesOf, type PagedList } from "../../marketplace/batch";
import type OzonModuleService from "../service";
import type { OzonSyncKind } from "../models/ozon-sync-run";
import { resolveEndpoint } from "../endpoints";
import { fixtureFor } from "../fixtures";
import { ozonRead, type OzonApiCallRecord, type OzonCredentials } from "../transport";

/**
 * What every import shares: its dependencies, the reader that counts requests
 * and answers from fixtures in fixture mode, the value readers, and the mirror
 * upsert.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

export type OzonSyncMode = "live" | "fixtures";

export type OzonSyncDeps = {
  ozon: OzonModuleService;
  tenantId: string;
  credentials: OzonCredentials;
  mode: OzonSyncMode;
  logger: Pick<Logger, "info" | "warn" | "error">;
};

export type OzonSyncOutcome = {
  kind: OzonSyncKind;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "failed";
  isFixture: boolean;
  error: string | null;
};

/** Guard against a cursor that stops moving: never loop forever on an answer. */
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
 * Money as Ozon sends it: a number on some methods, a decimal STRING on
 * others, and an object `{ amount, currency }` inside a posting's products.
 * All three are read here rather than assumed, because assuming one shape is
 * how a price silently becomes null.
 */
export const asAmount = (value: unknown): number | null => {
  if (value && typeof value === "object" && "amount" in (value as Record<string, unknown>)) {
    return asNumber((value as { amount?: unknown }).amount);
  }
  return asNumber(value);
};

export type OzonRunCounter = { requests: number; rows: number };

/**
 * One reader bound to this run: the tenant, the credentials, the run id and
 * the journal writer are the same for every request, and the caller only ever
 * names an endpoint.
 *
 * In fixture mode nothing opens a socket, but the id still goes through
 * `resolveEndpoint` and the call still lands in `ozon_api_call`, marked.
 */
export const readerFor = (deps: OzonSyncDeps, runId: string, counter: OzonRunCounter) => {
  const journal = async (entry: OzonApiCallRecord) => {
    await deps.ozon.createOzonApiCalls(entry);
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

    if (deps.mode === "fixtures") {
      const entry = resolveEndpoint(endpointId);
      const startedAt = Date.now();
      let data: T;
      let failure: string | null = null;
      try {
        data = fixtureFor<T>(endpointId, options.body);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        await journal({
          tenant_id: deps.tenantId,
          sync_run_id: runId,
          endpoint_id: entry.id,
          host: entry.host,
          method: entry.method,
          path: entry.path,
          status: null,
          ms: Date.now() - startedAt,
          error: failure,
          is_fixture: true,
          fetched_at: new Date(),
        });
        throw error;
      }
      await journal({
        tenant_id: deps.tenantId,
        sync_run_id: runId,
        endpoint_id: entry.id,
        host: entry.host,
        method: entry.method,
        path: entry.path,
        status: 200,
        ms: Date.now() - startedAt,
        error: null,
        is_fixture: true,
        fetched_at: new Date(),
      });
      deps.logger.info(`[ozon] fixture ${entry.id} (${entry.method} ${entry.path})`);
      return data;
    }

    const result = await ozonRead<T>(endpointId, {
      credentials: deps.credentials,
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

export type OzonReader = ReturnType<typeof readerFor>;

export type Upsert = { keys: Record<string, unknown>; values: Record<string, unknown> };

type MirrorEntity =
  | "OzonProduct"
  | "OzonPrice"
  | "OzonStock"
  | "OzonPosting"
  | "OzonReview"
  | "OzonQuestion";

/**
 * Writes one batch of mirror rows through the module service. Existing rows
 * are matched on the model's own unique key inside this tenant, so a second
 * run of the same import updates and never duplicates.
 *
 * Same shape as the Wildberries import's `upsertRows`; w12 folds the two into
 * the shared marketplace core.
 *
 * No call carries more than `MP_BATCH_SIZE` rows or keys, for the reason
 * written at the Wildberries twin (t-2026-10-06-21). The ids are resolved for
 * the whole answer before the first write, as the single lookup did.
 */
export const upsertRows = async (
  ozon: OzonModuleService,
  entity: MirrorEntity,
  tenantId: string,
  rows: Upsert[],
): Promise<number> => {
  if (!rows.length) {
    return 0;
  }

  const service = ozon as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const list = service[`list${entity}s`].bind(ozon) as unknown as PagedList<
    Record<string, unknown> & { id: string }
  >;
  const create = service[`create${entity}s`].bind(ozon);
  const update = service[`update${entity}s`].bind(ozon);

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

  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];

  for (const row of rows) {
    const id = byKey.get(keyOf(row.keys));
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.push({ tenant_id: tenantId, ...row.keys, ...row.values });
    }
  }

  for (const batch of chunk(toCreate)) {
    await create(batch);
  }
  for (const batch of chunk(toUpdate)) {
    await update(batch);
  }

  return rows.length;
};
