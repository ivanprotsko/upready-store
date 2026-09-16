import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type {
  CredentialFacts,
  CredentialSlot,
  InspectOptions,
  MarketplaceAdapter,
  MpKind,
  ReadOptions,
  ReadResult,
  SyncDeps,
  SyncOutcome,
} from "../marketplace/contract";
import { EXPIRY_WARNING_DAYS } from "../marketplace/contract";
import { validateAdapter } from "../marketplace/guards";
import { WB_MODULE } from "./index";
import type WbModuleService from "./service";
import { WB_READ_ENDPOINTS } from "./endpoints";
import { WB_SYNC_KINDS, type WbSyncKind } from "./models/wb-sync-run";
import { WB_MUTATIONS } from "./mutations";
import * as normalize from "./normalize";
import { inspectToken } from "./token";
import { wbRead } from "./transport";
import { runSync } from "./sync";
import { readWildberriesSecret } from "../../tenant-secrets/wildberries";

/**
 * Wildberries under the common contract (w12-marketplace-core).
 *
 * THIS FILE ADDS NOTHING TO WHAT WB CAN DO. `endpoints.ts`, `transport.ts`,
 * `sync.ts`, `token.ts` and the `wb_*` models are untouched by this task:
 * `wbRead` is still the single I/O point towards Wildberries and still the
 * only one this repository has. What is new is that the core can now hold
 * Wildberries the same way it holds Ozon, so the conformance suite, the repo
 * lint, the panel and the projector are written once instead of twice.
 *
 * There is no `write`, no method parameter and no URL parameter anywhere
 * below, and there is nowhere to add one: the contract has no member for it
 * and `validateAdapter` refuses an adapter that grows one.
 */

/** The token a WB read needs, narrowed from the contract's `unknown`. */
const asToken = (credentials: unknown): string => {
  if (typeof credentials === "string") {
    return credentials;
  }
  if (credentials && typeof credentials === "object" && "token" in credentials) {
    const token = (credentials as { token?: unknown }).token;
    if (typeof token === "string") {
      return token;
    }
  }
  throw new Error(
    "The Wildberries adapter takes the shop's API key as a string. It was given " +
      `${credentials === null || credentials === undefined ? "nothing" : typeof credentials}.`,
  );
};

const read = async <T>(endpointId: string, options: ReadOptions): Promise<ReadResult<T>> => {
  const result = await wbRead<T>(endpointId, {
    token: asToken(options.credentials),
    params: options.params,
    query: options.query,
    body: options.body,
    tenantId: options.tenantId,
    syncRunId: options.syncRunId,
    journal: options.journal,
    logger: options.logger,
  });
  return { status: result.status, data: result.data, endpoint: result.endpoint };
};

/**
 * What the WB key says about itself: the JWT payload, read against WB's own
 * documented bit table (`token.ts`, PR #71). No network call — a WB key
 * carries its own scope, unlike Ozon's opaque string.
 */
const inspectCredentials = async (
  credentials: unknown,
  _options?: InspectOptions,
): Promise<CredentialFacts> => {
  /**
   * `_options.journal` is unused here and that is the honest answer: a WB key
   * is a JWT and this function decodes it locally. Nothing leaves the process,
   * so there is no request to journal, and writing a row anyway would put a
   * call into `mp_api_call` that never happened.
   */
  const key = typeof credentials === "string" ? credentials : null;
  const facts = inspectToken(key);

  return {
    set: Boolean(key),
    last4: key ? (key.length >= 4 ? key.slice(-4) : "•".repeat(key.length)) : null,
    expiresAt: facts.expiresAt,
    expired: facts.expiresAt ? facts.expired : null,
    expiresInDays: facts.expiresInDays,
    expiringSoon: facts.expiringSoon,
    readOnly: facts.readOnly,
    readOnlySource:
      facts.readOnly === "unknown"
        ? null
        : `Бит ${30} маски «s» ключа, таблица полей токена: ${facts.docUrl}`,
    scopes: facts.categories.map((category) => ({
      name: category.name,
      granted: category.granted,
    })),
    raw: {
      token_id: facts.tokenId,
      seller_id: facts.sellerId,
      kind: facts.kind,
      sandbox: facts.sandbox,
      mask: facts.mask,
      bits: facts.bits,
      doc_url: facts.docUrl,
      expiry_warning_days: EXPIRY_WARNING_DAYS,
    },
    error: facts.error,
  };
};

/**
 * Where Wildberries keeps its key for a shop: one JWT in the
 * `wildberries` slot of `tenant_integration_secret`. `includeDisabled` is on
 * because the panel has to show a key that is stored but switched off — an
 * invisible key is a support call.
 */
const readCredentials = async (pg: unknown, tenantId: string): Promise<CredentialSlot | null> => {
  const secret = await readWildberriesSecret(pg as Knex, tenantId, { includeDisabled: true });
  if (!secret) {
    return null;
  }
  const key = secret.credentials.api_key;
  return {
    credentials: key,
    isEnabled: secret.is_enabled,
    last4: key ? (key.length >= 4 ? key.slice(-4) : "•".repeat(key.length)) : null,
  };
};

const wbService = (deps: SyncDeps): WbModuleService =>
  deps.container.resolve<WbModuleService>(WB_MODULE);

const runSyncForKind = async (deps: SyncDeps, kind: string): Promise<SyncOutcome> => {
  if (!WB_SYNC_KINDS.includes(kind as WbSyncKind)) {
    throw new Error(
      `Wildberries has no sync kind ${kind}. Known kinds: ${WB_SYNC_KINDS.join(", ")}.`,
    );
  }
  const outcome = await runSync(
    {
      wb: wbService(deps),
      tenantId: deps.tenantId,
      token: asToken(deps.credentials),
      logger: deps.logger,
    },
    kind as WbSyncKind,
  );
  return {
    kind: outcome.kind,
    runId: outcome.runId,
    rows: outcome.rows,
    requests: outcome.requests,
    status: outcome.status,
    error: outcome.error,
    retryAt: outcome.retryAt ?? null,
  };
};

/**
 * The raw rows one normalized kind is computed from.
 *
 * The JOINS live here, not in `normalize.ts`: a feedback carries no
 * `vendorCode` and an offer needs both the price and the stock table, so the
 * loader is where the mirrors are read and stitched, and `normalize` stays a
 * pure function of whatever it is handed.
 */
const loadMirror = async (deps: SyncDeps, kind: MpKind): Promise<unknown[]> => {
  const wb = wbService(deps);
  const scope = { tenant_id: deps.tenantId };

  if (kind === "products") {
    return (await wb.listWbProducts(scope)) as unknown[];
  }

  if (kind === "offers") {
    const [prices, stocks] = await Promise.all([
      wb.listWbPrices(scope) as Promise<Record<string, unknown>[]>,
      wb.listWbStocks(scope) as Promise<Record<string, unknown>[]>,
    ]);
    return [
      ...prices.map((row) => ({ source: "price" as const, row })),
      ...stocks.map((row) => ({ source: "stock" as const, row })),
    ];
  }

  /**
   * Orders come from TWO mirrors and the tag says which (w15-mp-orders-desk):
   * `wb_order` holds the statistics method's rows, `wb_fbs_order` the assembly
   * orders w23 mirrors. They answer different questions — statistics knows the
   * money and the buyer's region, an assembly order knows the scheme and both
   * statuses — and the single order feed needs the union of the two.
   *
   * The tag is what keeps `normalize.ts` pure: without it the normalizer would
   * have to guess which mirror a row came from by sniffing its fields, and a
   * column added on either side would change that guess silently.
   */
  if (kind === "orders") {
    const [statistics, fbs] = await Promise.all([
      wb.listWbOrders(scope) as Promise<Record<string, unknown>[]>,
      wb.listWbFbsOrders(scope) as Promise<Record<string, unknown>[]>,
    ]);
    return [
      ...statistics.map((row) => ({ source: "statistics" as const, row })),
      ...fbs.map((row) => ({ source: "fbs" as const, row })),
    ];
  }

  if (kind === "reviews") {
    const [feedbacks, products] = await Promise.all([
      wb.listWbFeedbacks(scope) as Promise<Record<string, unknown>[]>,
      wb.listWbProducts(scope) as Promise<Record<string, unknown>[]>,
    ]);
    const vendorCodeByNmId = new Map<string, string | null>(
      products.map((product) => [
        String(product.nm_id),
        product.vendor_code ? String(product.vendor_code) : null,
      ]),
    );
    return feedbacks.map((feedback) => ({
      ...feedback,
      vendor_code: vendorCodeByNmId.get(String(feedback.nm_id)) ?? null,
    }));
  }

  /**
   * Questions. Mirrored since w03-wb-sales-questions-mirror added `wb_question`
   * and registered the read; before that this was an empty list, and saying so
   * in a comment is the only reason the change was noticed here at all.
   */
  return (await wb.listWbQuestions(scope)) as unknown[];
};

/**
 * The Wildberries run log and transport journal, exactly as `modules/wb` wrote
 * them. `sync.ts` is untouched by this task, so this is how its rows reach the
 * shared tables (see `loadJournal` in the contract).
 */
const loadJournal = async (deps: SyncDeps) => {
  const wb = wbService(deps);
  const scope = { tenant_id: deps.tenantId };
  const [runs, calls] = await Promise.all([
    wb.listWbSyncRuns(scope) as Promise<Record<string, unknown>[]>,
    wb.listWbApiCalls(scope) as Promise<Record<string, unknown>[]>,
  ]);
  return { runs, calls };
};

export const wbAdapter: MarketplaceAdapter = {
  id: "wb",
  label: "Wildberries",
  hostSuffixes: [".wildberries.ru"],
  endpoints: WB_READ_ENDPOINTS,
  mutationDenyList: WB_MUTATIONS,
  read,
  inspectCredentials,
  readCredentials,
  syncKinds: WB_SYNC_KINDS,
  runSync: runSyncForKind,
  loadMirror,
  loadJournal,
  normalize: {
    products: normalize.products,
    offers: normalize.offers,
    orders: normalize.orders,
    reviews: normalize.reviews,
    questions: normalize.questions,
  },
};

/**
 * Runs at module load, so a registry entry that names a mutation, a foreign
 * host or a write verb fails the process at boot rather than at the first
 * sync. The conformance suite runs the same check again over every adapter in
 * `MARKETPLACES`.
 */
validateAdapter(wbAdapter);

export default wbAdapter;
