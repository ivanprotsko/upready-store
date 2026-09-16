/**
 * The adapter contract of the `marketplace` core (w12-marketplace-core).
 *
 * TYPES ONLY. Nothing in this file opens a socket, touches a database or
 * imports a marketplace module: it is the shape both adapters are written
 * against, and the shape the conformance suite checks them by.
 *
 * WHY A CONTRACT AT ALL. Three screens of the parity matrix — one order feed,
 * one price-and-stock table, reviews — are ONE screen over TWO marketplaces
 * (`research/marketplace-spec.md`, section 1). Without a normalized layer each
 * of them gets written twice and the two copies drift. The read-only
 * invariant has the same problem one level down: the registry, the single
 * call site, the fetch spy and the repo lint are one set of rules that has to
 * apply to EVERY adapter automatically. A rule copied by hand into the second
 * adapter is a rule the third adapter forgets (rule 20).
 *
 * THE STANDING INVARIANT (Ivan, 2026-09-16 02:46 WITA). Marketplaces are
 * read-only for us. There is no `write` member on this type, no method, no
 * host and no URL a caller can supply, and no way to express a mutation:
 * `read` takes an endpoint ID, and the method comes from the registry entry.
 * The core makes the existing guarantee stronger, never weaker.
 */

/** Every marketplace this repository knows. Extended only together with an adapter. */
export type MarketplaceId = "wb" | "ozon";

/** The verbs a registry entry may carry. A write verb is unregistrable (`guards.ts`). */
export type ReadMethod = "GET" | "POST";

/** A read the marketplace documents as a POST with a request body. */
export type ReadViaPost = {
  /** The doc page and anchor the claim was read from. */
  docUrl: string;
  /** The method's own sentence in the documentation, copied verbatim. */
  reason: string;
};

/**
 * One allowed READ. Structurally identical to `WbReadEndpoint` (PR #71) and
 * `OzonReadEndpoint` (PR #79), which is the point: both adapters already had
 * the same shape, and this is where that shape stops being a coincidence.
 */
export type ReadEndpoint = {
  /** Stable id: the sync scripts, the journal and the panel all name it. */
  id: string;
  /** Host without a scheme. Must end with one of the adapter's `hostSuffixes`. */
  host: string;
  /** Comes from THIS entry, never from the caller. */
  method: ReadMethod;
  /** Absolute path with `:name` placeholders. */
  path: string;
  /** The doc page and anchor this entry was read from. Required on every entry. */
  docUrl: string;
  /** The method's title in the marketplace's documentation. */
  summary: string;
  /** Required for, and only for, `method: "POST"`. */
  readViaPost?: ReadViaPost;
  /** Overrides the adapter's default timeout. Only by measurement, never by taste. */
  timeoutMs?: number;
  /** The documented minimum interval between two calls of this method, where one is stated. */
  minIntervalMs?: number;
};

/** One row of a transport journal: proof of what left the process. */
export type ApiCallRecord = {
  tenant_id: string | null;
  sync_run_id: string | null;
  endpoint_id: string;
  host: string;
  method: ReadMethod;
  path: string;
  status: number | null;
  ms: number;
  error: string | null;
  fetched_at: Date;
};

/**
 * What a caller may vary. Never the method, never the host, never the URL.
 *
 * `credentials` is `unknown` on purpose: WB authenticates with one JWT string
 * and Ozon with a `Client-Id` + `Api-Key` pair, and the core has no business
 * knowing which. Each adapter narrows it in its own `read`.
 */
export type ReadOptions = {
  credentials: unknown;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  tenantId?: string | null;
  syncRunId?: string | null;
  journal?: (entry: ApiCallRecord) => Promise<void> | void;
  logger?: Pick<Console, "info" | "warn">;
};

export type ReadResult<T = unknown> = {
  status: number;
  data: T;
  endpoint: ReadEndpoint;
};

/** One named permission of a key, with whether the key actually has it. */
export type CredentialScope = {
  name: string;
  granted: boolean;
};

/**
 * What the key says about ITSELF, asked of the marketplace or decoded from the
 * key, never remembered (rule 17a).
 *
 * `readOnly` has three states and the third one is legal: `"unknown"` is the
 * honest answer when the question could not be asked. Telling an owner their
 * key is read-only because it probably is would be a value substituted for a
 * measurement (rule 20a).
 */
export type CredentialFacts = {
  /** Whether a key is stored at all. */
  set: boolean;
  /** Last four characters of the key. Never the key. */
  last4: string | null;
  /** ISO 8601, or `null` when the key carries no expiry we can read. */
  expiresAt: string | null;
  /** Whether that date has already passed. `null` when there is no date. */
  expired: boolean | null;
  /** Whole days until expiry, floored. Negative once expired, `null` when unreadable. */
  expiresInDays: number | null;
  /** `true` only when the key is not yet expired and expires inside the warning window. */
  expiringSoon: boolean;
  /** `true` | `false` | `"unknown"`. Never `true` from memory. */
  readOnly: true | false | "unknown";
  /** How `readOnly` was decided, in one sentence, with the doc URL in it. */
  readOnlySource: string | null;
  /** Every documented scope, granted and denied alike. */
  scopes: CredentialScope[];
  /** Fields that are safe to show. The key itself is never in here. */
  raw: Record<string, unknown>;
  /** Set when the question could not be asked or answered. Shown as is. */
  error: string | null;
};

/** How many days before expiry the panel warns. One number for every marketplace. */
export const EXPIRY_WARNING_DAYS = 14;

/**
 * One documented MUTATION of a marketplace: the second belt of the read-only
 * invariant (spec 2.5, belt 4).
 *
 * Nothing routes THROUGH this list — the registry is default-deny and a path
 * absent from it cannot be called whatever the list says. The list is a
 * tripwire on the AUTHOR: a registry entry whose (method, path) stands here
 * fails module load, loudly, at boot. It exists because on both marketplaces
 * the same path is a read under one verb and a write under another, and a
 * typo in the verb is invisible to the eye.
 *
 * `method: "*"` means every verb on that path is a mutation.
 */
export type MutationEntry = {
  method: ReadMethod | "PUT" | "PATCH" | "DELETE" | "*";
  /** Path as the documentation writes it, with `{placeholders}` normalised to `:name`. */
  path: string;
  /** The method's own title in the documentation. Evidence, not a label. */
  summary: string;
  /** Where that title was read. */
  docUrl: string;
};

/* ------------------------------------------------------------------ *
 * The normalized layer: what an adapter produces (spec section 2.3).
 * Drafts are ROWS, so their fields are snake_case like the models they
 * become, and `source_row_id` + `synced_at` are on every one of them:
 * a normalized row must always be able to name the raw row it came from.
 * ------------------------------------------------------------------ */

type DraftBase = {
  tenant_id: string;
  marketplace: MarketplaceId;
  /** The id of the raw mirror row this was computed from. */
  source_row_id: string;
  synced_at: Date;
};

export type MpProductDraft = DraftBase & {
  /** WB `nmID`, Ozon `product_id`. */
  external_id: string;
  /** WB `vendorCode`, Ozon `offer_id`. The key the shop catalog is matched on. */
  vendor_code: string | null;
  /** Ozon `sku`. WB has no second identifier at card level. */
  sku_external: string | null;
  title: string | null;
  brand: string | null;
  category_name: string | null;
  photos: unknown;
  attributes: unknown;
  /** When the card last changed ON the marketplace, when it says. */
  mp_updated_at: Date | null;
};

export type MpOfferDraft = DraftBase & {
  /**
   * The identity of one price-and-stock line, built by the adapter from the
   * dimensions that actually apply: `${external_id}|${size_external}|${warehouse_id}`.
   *
   * A composite unique index over nullable columns would not dedupe in
   * Postgres, and filling an absent dimension with a sentinel would be a value
   * substituted for an absence (rule 20a). So the derived key is a column, and
   * an absent dimension is an empty segment inside it while the column itself
   * stays `null`.
   */
  offer_key: string;
  external_id: string;
  vendor_code: string | null;
  /** WB `chrtID`/`sizeID`. Ozon has no size dimension and leaves this `null`. */
  size_external: string | null;
  /**
   * Ozon `sku`: the marketplace's own item number for one scheme. Not in the
   * spec's own column list for `mp_offer`, added because without it an Ozon
   * stock line cannot be told from another line of the same product, and WB
   * puts its barcode here.
   */
  sku_external: string | null;
  /**
   * Ozon reports stock per (stock type, shipment type) rather than per
   * warehouse: `fbo` / `fbs`. Calling that a warehouse would mislabel it, so
   * it gets its own nullable column and WB leaves it `null`.
   */
  storage_type: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  price: number | null;
  discount_price: number | null;
  currency: string | null;
  stock: number | null;
  reserved: number | null;
  measured_at: Date | null;
};

export type MpOrderLineDraft = {
  /** `${order external_id}|${line external_id}`, for the same reason `offer_key` exists. */
  line_key: string;
  vendor_code: string | null;
  external_id: string | null;
  qty: number | null;
  price: number | null;
  discount: number | null;
};

export type MpOrderDraft = DraftBase & {
  /** WB `srid`, Ozon `posting_number`. */
  external_id: string;
  /** FBS | FBO | DBS | rFBS, or `null` where the marketplace does not say. */
  scheme: string | null;
  status: string | null;
  status_changed_at: Date | null;
  ordered_at: Date | null;
  buyer_region: string | null;
  warehouse_name: string | null;
  total: number | null;
  currency: string | null;
  is_cancelled: boolean;
  lines: MpOrderLineDraft[];
};

export type MpReviewDraft = DraftBase & {
  external_id: string;
  vendor_code: string | null;
  rating: number | null;
  text: string | null;
  pros: string | null;
  cons: string | null;
  author: string | null;
  created_at: Date | null;
  is_answered: boolean;
};

export type MpQuestionDraft = DraftBase & {
  external_id: string;
  vendor_code: string | null;
  question_text: string | null;
  author: string | null;
  created_at: Date | null;
  is_answered: boolean;
};

/** The five normalized kinds. One projector loop, one panel, two marketplaces. */
export const MP_KINDS = ["products", "offers", "orders", "reviews", "questions"] as const;
export type MpKind = (typeof MP_KINDS)[number];

/**
 * The shop's stored credentials for ONE marketplace, as the adapter reads them
 * out of `tenant_integration_secret`.
 *
 * WHERE a marketplace's key lives, and under which provider name, is knowledge
 * of that marketplace and therefore of its adapter — WB keeps one JWT under
 * `wildberries`, Ozon keeps a `Client-Id` + `Api-Key` pair under `ozon`. The
 * core asks the adapter rather than holding a second table of its own that
 * would have to learn every new marketplace by hand (rule 20).
 *
 * The key itself never leaves this object: the routes return `CredentialFacts`.
 */
export type CredentialSlot = {
  /** Adapter-shaped, ready to hand to `read` / `runSync`. */
  credentials: unknown;
  /** Whether the shop has the integration switched on. */
  isEnabled: boolean;
  /** Last four characters of the key. Never the key. */
  last4: string | null;
};

/**
 * What an adapter needs to do its work, without the core knowing any of its
 * types. `container` is Medusa's own, so the adapter resolves ITS module
 * service by ITS key; the core resolves nothing.
 */
export type SyncDeps = {
  container: { resolve: <T>(key: string) => T };
  tenantId: string;
  /** Adapter-shaped. `null` when the shop has no key: a run then fails visibly. */
  credentials: unknown;
  logger: Pick<Console, "info" | "warn" | "error">;
  /** Adapter-specific knobs, e.g. Ozon's recorded-fixtures mode. */
  options?: Record<string, unknown>;
};

export type SyncOutcome = {
  kind: string;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "failed";
  error: string | null;
};

/**
 * One marketplace, under one contract.
 *
 * Everything that needs the list of marketplaces imports `MARKETPLACES` from
 * `registry.ts`. A second hard-coded list anywhere is the defect the registry
 * exists to remove.
 */
export type MarketplaceAdapter = {
  id: MarketplaceId;
  /** What the owner sees: «Wildberries», «Ozon». */
  label: string;
  /** Every registered host must end with one of these. */
  hostSuffixes: readonly string[];
  /** The allowlist. Default deny: an id absent from it cannot reach the network. */
  endpoints: readonly ReadEndpoint[];
  /**
   * The documented mutations of this marketplace. Lives WITH the adapter
   * rather than in the core, so there is exactly one copy of it: `guards.ts`
   * enforces it and `registry.ts` indexes it.
   */
  mutationDenyList: readonly MutationEntry[];
  /** The ONE network I/O point of this adapter. No fetch, no base URL, no raw helper. */
  read: <T>(endpointId: string, options: ReadOptions) => Promise<ReadResult<T>>;
  /** What the key says about itself. Never throws: an unanswered question is a fact. */
  inspectCredentials: (credentials: unknown) => Promise<CredentialFacts>;
  /**
   * The shop's stored credentials for this marketplace, or `null` when it has
   * none. `pg` is the Knex connection Medusa registers; it is `unknown` here
   * because the core does not import the database types either.
   */
  readCredentials: (pg: unknown, tenantId: string) => Promise<CredentialSlot | null>;
  /** The adapter's own import kinds, in its own vocabulary (WB: cards, Ozon: products). */
  syncKinds: readonly string[];
  runSync: (deps: SyncDeps, kind: string) => Promise<SyncOutcome>;
  /**
   * The raw mirror rows one normalized kind is computed from, in whatever
   * shape THIS adapter's `normalize` expects. The projector never knows what
   * is inside; it only passes the array on.
   */
  loadMirror: (deps: SyncDeps, kind: MpKind) => Promise<unknown[]>;
  /** Raw rows of this marketplace -> `mp_*` drafts. Pure functions, no I/O. */
  normalize: {
    products: (rows: unknown[]) => MpProductDraft[];
    offers: (rows: unknown[]) => MpOfferDraft[];
    orders: (rows: unknown[]) => MpOrderDraft[];
    reviews: (rows: unknown[]) => MpReviewDraft[];
    questions: (rows: unknown[]) => MpQuestionDraft[];
  };
};

/**
 * The exact key set of an adapter. The conformance suite compares against it,
 * so an escape hatch bolted onto one adapter ("just a raw helper, only here")
 * turns the suite red by the fact of existing.
 */
export const ADAPTER_KEYS = [
  "id",
  "label",
  "hostSuffixes",
  "endpoints",
  "mutationDenyList",
  "read",
  "inspectCredentials",
  "readCredentials",
  "syncKinds",
  "runSync",
  "loadMirror",
  "normalize",
] as const;
