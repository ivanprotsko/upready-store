import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type {
  CredentialFacts,
  CredentialSlot,
  InspectOptions,
  MarketplaceAdapter,
  MpKind,
  MutationEntry,
  ReadOptions,
  ReadResult,
  SyncDeps,
  SyncOutcome,
} from "../marketplace/contract";
import { EXPIRY_WARNING_DAYS } from "../marketplace/contract";
import { validateAdapter } from "../marketplace/guards";
import { OZON_MODULE } from "./index";
import type OzonModuleService from "./service";
import {
  OZON_READ_ENDPOINTS,
  OZON_WRITE_PATHS,
} from "./endpoints";
import { OZON_SYNC_KINDS, type OzonSyncKind } from "./models/ozon-sync-run";
import {
  OZON_ROLES_DOC_URL,
  inspectCredentials as inspectOzonCredentials,
  type OzonCredentialFacts,
} from "./credentials";
import * as normalize from "./normalize";
import { ozonRead, type OzonCredentials } from "./transport";
import { runSync } from "./sync";
import { readOzonSecret } from "../../tenant-secrets/ozon";

/**
 * Ozon under the common contract (w12-marketplace-core).
 *
 * Like the Wildberries adapter, this file adds no capability: `ozonRead` is
 * still the single I/O point towards Ozon and the registry is still
 * default-deny. What it adds is that the SAME conformance suite, repo lint,
 * panel and projector now cover Ozon without a line of Ozon-specific code in
 * the core — which is the whole point of the task (rule 20: a rule copied by
 * hand into the second adapter is a rule the third one forgets).
 */

/**
 * The mutation deny-list, DERIVED from `OZON_WRITE_PATHS` rather than retyped.
 *
 * `endpoints.ts` already holds that list, it is checked against the saved
 * documentation and `credentials.ts` decides `readOnly` from it. A second copy
 * in the core would be exactly the defect this task exists to remove, so the
 * core gets a view of the one list, not a twin of it.
 *
 * `method: "*"` because Ozon's Seller API is POST-only in practice (461 of
 * 467 documented methods), so the path alone decides.
 */
export const OZON_MUTATIONS: readonly MutationEntry[] = Object.entries(OZON_WRITE_PATHS).map(
  ([path, summary]) => ({
    method: "*" as const,
    path,
    summary,
    docUrl: "https://docs.ozon.ru/api/seller/",
  }),
);

const asCredentials = (credentials: unknown): OzonCredentials => {
  if (
    credentials &&
    typeof credentials === "object" &&
    typeof (credentials as OzonCredentials).clientId === "string" &&
    typeof (credentials as OzonCredentials).apiKey === "string"
  ) {
    return credentials as OzonCredentials;
  }
  throw new Error(
    "The Ozon adapter takes { clientId, apiKey }. It was given " +
      `${credentials === null || credentials === undefined ? "nothing" : typeof credentials}.`,
  );
};

const read = async <T>(endpointId: string, options: ReadOptions): Promise<ReadResult<T>> => {
  const result = await ozonRead<T>(endpointId, {
    credentials: asCredentials(options.credentials),
    params: options.params,
    query: options.query,
    body: options.body,
    tenantId: options.tenantId,
    syncRunId: options.syncRunId,
    journal: options.journal
      ? (entry) => options.journal?.({ ...entry })
      : undefined,
    logger: options.logger,
  });
  return { status: result.status, data: result.data, endpoint: result.endpoint };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from now to `expiresAt`, floored. `null` when there is no date. */
const daysUntil = (expiresAt: string | null): number | null => {
  if (!expiresAt) {
    return null;
  }
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? Math.floor((at - Date.now()) / DAY_MS) : null;
};

/**
 * What the Ozon key says about itself. Unlike WB's JWT, an Ozon key is an
 * opaque string, so this is a NETWORK call (`POST /v1/roles`) and it is
 * journalled like any other read. It never throws: an unanswered question is
 * a fact the panel has to render, not an error that hides the card.
 */
const inspectCredentials = async (
  credentials: unknown,
  options?: InspectOptions,
): Promise<CredentialFacts> => {
  let facts: OzonCredentialFacts;
  try {
    facts = await inspectOzonCredentials(
      credentials && typeof credentials === "object"
        ? (credentials as OzonCredentials)
        : null,
      {
        tenantId: options?.tenantId,
        /**
         * The question IS a request to Ozon, so it is journalled like any
         * other read. A call that leaves the process without a row makes the
         * journal lie by omission, which is the one thing it exists not to do
         * (rule 20a, and `__tests__/credentials.unit.spec.ts` enforces it over
         * every call site in `src`).
         */
        journal: options?.journal
          ? (entry) => options.journal?.({ ...entry })
          : undefined,
        logger: options?.logger,
      },
    );
  } catch (error) {
    return {
      set: false,
      last4: null,
      expiresAt: null,
      expired: null,
      expiresInDays: null,
      expiringSoon: false,
      readOnly: "unknown",
      readOnlySource: null,
      scopes: [],
      raw: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const expiresInDays = daysUntil(facts.expiresAt);

  return {
    set: facts.set,
    last4: facts.last4,
    expiresAt: facts.expiresAt,
    expired: facts.expired,
    expiresInDays,
    expiringSoon:
      expiresInDays !== null && expiresInDays >= 0 && expiresInDays <= EXPIRY_WARNING_DAYS,
    readOnly: facts.readOnly,
    readOnlySource: facts.readOnlySource,
    /**
     * Ozon names a scope with a ROLE, and a role that came back is granted by
     * construction: the answer lists what this key has. A role Ozon did not
     * mention is not a denied role we know about, so nothing is invented here
     * (rule 17a) — `raw.write_methods` carries the part that decides `readOnly`.
     */
    scopes: facts.roles.map((role) => ({ name: role.name, granted: true })),
    raw: {
      client_id: facts.clientId,
      roles: facts.roles,
      write_methods: facts.writeMethods,
      doc_url: OZON_ROLES_DOC_URL,
      expiry_warning_days: EXPIRY_WARNING_DAYS,
    },
    error: facts.error,
  };
};

/**
 * Where Ozon keeps its credentials for a shop: the `Client-Id` + `Api-Key`
 * pair in the `ozon` slot of `tenant_integration_secret`. Same
 * `includeDisabled` reason as the Wildberries adapter.
 */
const readCredentials = async (pg: unknown, tenantId: string): Promise<CredentialSlot | null> => {
  const secret = await readOzonSecret(pg as Knex, tenantId, { includeDisabled: true });
  if (!secret) {
    return null;
  }
  const key = secret.credentials.api_key;
  return {
    credentials: {
      clientId: secret.credentials.client_id,
      apiKey: key,
    },
    isEnabled: secret.is_enabled,
    last4: key ? (key.length >= 4 ? key.slice(-4) : "•".repeat(key.length)) : null,
  };
};

const ozonService = (deps: SyncDeps): OzonModuleService =>
  deps.container.resolve<OzonModuleService>(OZON_MODULE);

const runSyncForKind = async (deps: SyncDeps, kind: string): Promise<SyncOutcome> => {
  if (!OZON_SYNC_KINDS.includes(kind as OzonSyncKind)) {
    throw new Error(`Ozon has no sync kind ${kind}. Known kinds: ${OZON_SYNC_KINDS.join(", ")}.`);
  }

  const outcome = await runSync(
    {
      ozon: ozonService(deps),
      tenantId: deps.tenantId,
      credentials: asCredentials(deps.credentials),
      mode: deps.options?.fixtures ? "fixtures" : "live",
      logger: deps.logger,
    },
    kind as OzonSyncKind,
  );

  return {
    kind: outcome.kind,
    runId: outcome.runId,
    rows: outcome.rows,
    requests: outcome.requests,
    status: outcome.status,
    error: outcome.error,
  };
};

/** `sku` -> the seller's own article, so a review can name the catalog key. */
const vendorCodeBySku = (products: Record<string, unknown>[]): Map<string, string | null> =>
  new Map(
    products
      .filter((product) => product.sku)
      .map((product) => [
        String(product.sku),
        product.offer_id ? String(product.offer_id) : null,
      ]),
  );

const loadMirror = async (deps: SyncDeps, kind: MpKind): Promise<unknown[]> => {
  const ozon = ozonService(deps);
  const scope = { tenant_id: deps.tenantId };

  if (kind === "products") {
    return (await ozon.listOzonProducts(scope)) as unknown[];
  }

  if (kind === "offers") {
    const [prices, stocks] = await Promise.all([
      ozon.listOzonPrices(scope) as Promise<Record<string, unknown>[]>,
      ozon.listOzonStocks(scope) as Promise<Record<string, unknown>[]>,
    ]);
    return [
      ...prices.map((row) => ({ source: "price" as const, row })),
      ...stocks.map((row) => ({ source: "stock" as const, row })),
    ];
  }

  if (kind === "orders") {
    return (await ozon.listOzonPostings(scope)) as unknown[];
  }

  if (kind === "reviews") {
    const [reviews, products] = await Promise.all([
      ozon.listOzonReviews(scope) as Promise<Record<string, unknown>[]>,
      ozon.listOzonProducts(scope) as Promise<Record<string, unknown>[]>,
    ]);
    const bySku = vendorCodeBySku(products);
    return reviews.map((review) => ({
      ...review,
      vendor_code: bySku.get(String(review.sku)) ?? null,
    }));
  }

  const [questions, products] = await Promise.all([
    ozon.listOzonQuestions(scope) as Promise<Record<string, unknown>[]>,
    ozon.listOzonProducts(scope) as Promise<Record<string, unknown>[]>,
  ]);
  const bySku = vendorCodeBySku(products);
  return questions.map((question) => ({
    ...question,
    vendor_code: bySku.get(String(question.sku)) ?? null,
  }));
};

/** The Ozon run log and transport journal. Same reason as the WB adapter's. */
const loadJournal = async (deps: SyncDeps) => {
  const ozon = ozonService(deps);
  const scope = { tenant_id: deps.tenantId };
  const [runs, calls] = await Promise.all([
    ozon.listOzonSyncRuns(scope) as Promise<Record<string, unknown>[]>,
    ozon.listOzonApiCalls(scope) as Promise<Record<string, unknown>[]>,
  ]);
  return { runs, calls };
};

export const ozonAdapter: MarketplaceAdapter = {
  id: "ozon",
  label: "Ozon",
  hostSuffixes: ["api-seller.ozon.ru"],
  endpoints: OZON_READ_ENDPOINTS,
  mutationDenyList: OZON_MUTATIONS,
  read,
  inspectCredentials,
  readCredentials,
  syncKinds: OZON_SYNC_KINDS,
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

/** Fails module load on a bad entry, exactly as the Wildberries adapter does. */
validateAdapter(ozonAdapter);

export default ozonAdapter;
