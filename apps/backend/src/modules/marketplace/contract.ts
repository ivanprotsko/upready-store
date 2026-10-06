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

/**
 * What an adapter needs in order to ask the key about itself without the
 * evidence going missing.
 */
export type InspectOptions = {
  tenantId?: string | null;
  /** One row per request this question actually sent. */
  journal?: (entry: ApiCallRecord) => Promise<void> | void;
  logger?: Pick<Console, "info" | "warn">;
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
  /**
   * The marketplace's second status string (WB `wbStatus`, Ozon `substatus`),
   * raw. `null` where the marketplace answers with one status only
   * (w15-mp-orders-desk).
   */
  status_detail: string | null;
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
  /**
   * When the key was last saved (`tenant_integration_secret.updated_at`). The
   * scheduler retries an `auth_failed` kind as soon as this moves past the
   * refused run (audit 2026-09-23, C-01).
   */
  updatedAt?: Date | null;
};

/**
 * ONE field the shop owner types into the panel to connect this marketplace
 * (w24-integration-keys-self-service).
 *
 * `name` is BOTH the body key of `PUT /tenants/marketplaces/:id/key` and the
 * key inside the encrypted payload, so the route builds the credential object
 * from this list and nothing maps one spelling onto another. WB declares
 * `api_key`, Ozon declares `client_id` + `api_key`, and those are exactly the
 * fields `WildberriesCredentials` and `OzonCredentialsPayload` hold.
 *
 * WHY IT IS THE ADAPTER'S. Ivan's order of 2026-09-16 11:37 WITA is that the
 * owner of a SaaS shop enters every key herself, for every service. A form
 * hard-coded per marketplace in the panel would have to learn the third
 * marketplace by hand, in the panel, in Russian and in English, and would be
 * forgotten there exactly the way the sidebar entry was (rule 20). With this
 * member the panel renders whatever the registry declares.
 *
 * `secret: true` means the value is masked on every read and is KEPT when the
 * owner saves the form with that field left empty; a field that is not secret
 * (Ozon's `Client-Id` identifies a cabinet, it does not authorise) comes back
 * in full and is required on every save.
 */
export type CredentialField = {
  /** Body key and payload key. Lower snake case, as the payload types spell it. */
  name: string;
  /** Owner-facing label, in the marketplace's own words («Client-Id», «Токен»). */
  label: string;
  /** Masked on read, kept on an empty save. */
  secret: boolean;
  /** Where in the marketplace's cabinet the owner finds this value. One sentence. */
  hint: string;
  /** The page of the marketplace's own documentation that sentence was read from. */
  docUrl: string;
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
  /**
   * THREE outcomes, not two. `rate_limited` is a run the marketplace refused
   * to serve right now, which is neither a success nor a defect of ours, and
   * flattening it into `failed` would send the owner looking for a bug that is
   * not there (w03 added it to Wildberries; rule 20a — a run that did not
   * happen has to be visible AS WHAT IT WAS).
   */
  status: "succeeded" | "rate_limited" | "failed";
  error: string | null;
  /** Set only for `rate_limited`: when the marketplace said this may be read again. */
  retryAt?: Date | null;
};

/** Which rows of its journal an adapter is asked for. See `loadJournal`. */
export type JournalPage = {
  /** The table the page is of. The other one comes back empty. */
  of: "runs" | "calls";
  /** The id of the last row of the previous page, `null` for the first. Rows come in id order. */
  after: string | null;
  /** The most rows the page holds. */
  take: number;
  /** Only the calls of this run, named by the adapter's own run id. */
  syncRunId?: string;
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
  /**
   * What the key says about itself. Never throws: an unanswered question is a
   * fact to report, not an error that hides the card.
   *
   * `options.journal` is REQUIRED reading, not decoration: on Ozon this is a
   * real `POST /v1/roles`, and a request that leaves the process without a
   * journal row makes `mp_api_call` lie by omission (rule 20a). Wildberries
   * decodes its own JWT and calls nobody, so it journals nothing — and that is
   * the difference the journal is supposed to show.
   */
  inspectCredentials: (
    credentials: unknown,
    options?: InspectOptions,
  ) => Promise<CredentialFacts>;
  /**
   * The shop's stored credentials for this marketplace, or `null` when it has
   * none. `pg` is the Knex connection Medusa registers; it is `unknown` here
   * because the core does not import the database types either.
   */
  readCredentials: (pg: unknown, tenantId: string) => Promise<CredentialSlot | null>;
  /**
   * One line telling the owner HOW this shop's key gets stored, for the panel
   * to show where the key is absent (w14-mp-catalog-link).
   *
   * It belongs to the adapter for the same reason `readCredentials` does: WB
   * takes one JWT and Ozon takes a `Client-Id` + `Api-Key` pair, and a list of
   * marketplaces kept anywhere else would have to learn every new one by hand
   * (rule 20). It names the command or the screen that exists TODAY and
   * nothing else — a hint that invents a button is worse than no hint, because
   * the owner goes looking for it (rule 17a).
   */
  credentialHowTo: string;
  /**
   * The provider name of this marketplace's READ credential in
   * `tenant_integration_secret` — `wildberries`, `ozon`
   * (w24-integration-keys-self-service).
   *
   * Declared rather than inferred so the key ROUTE can write the same slot
   * `readCredentials` reads, without the core learning a provider table of its
   * own. A write slot (`wildberries_write`, w20) is NOT an adapter's slot and
   * `guards.ts` refuses one here: the owner's form fills the read key and the
   * write credential stays outside every HTTP surface.
   */
  credentialSlot: string;
  /**
   * What the owner types to connect this marketplace, in the order the form
   * shows it. The panel renders the form from this list and the key route
   * builds the encrypted payload from it.
   */
  credentialFields: readonly CredentialField[];
  /** The adapter's own import kinds, in its own vocabulary (WB: cards, Ozon: products). */
  syncKinds: readonly string[];
  /**
   * Which of THIS adapter's import kinds fill one normalized kind
   * (w18-mp-reviews-desk).
   *
   * The desk screens are written per normalized kind — «отзывы», «вопросы» —
   * while the importers are written in each marketplace's own vocabulary: WB
   * imports `feedbacks`, Ozon imports `reviews`. Without this member a caller
   * that wants "import what fills mp_review, everywhere" has to keep a table
   * of marketplace vocabularies of its own, which is the second enumeration
   * the registry exists to remove (rule 20).
   *
   * Every value must be one of `syncKinds`; `guards.ts` refuses a typo. A
   * normalized kind this adapter does not import at all maps to an empty
   * array, which is a statement rather than a gap.
   */
  mirrorKinds: Readonly<Record<MpKind, readonly string[]>>;
  runSync: (deps: SyncDeps, kind: string) => Promise<SyncOutcome>;
  /**
   * The raw mirror rows one normalized kind is computed from, in whatever
   * shape THIS adapter's `normalize` expects. The projector never knows what
   * is inside; it only passes the array on.
   */
  loadMirror: (deps: SyncDeps, kind: MpKind) => Promise<unknown[]>;
  /**
   * This adapter's OWN run log and transport journal, as rows.
   *
   * The imports keep writing `wb_sync_run` / `ozon_sync_run` — `modules/wb`
   * and `modules/ozon` are not rewritten by this task — so the shared
   * `mp_sync_run` / `mp_api_call` would otherwise hold nothing but what the
   * backfill migration carried across once, and would age into a lie the day
   * after it ran. The projector copies these on every run, keyed on a derived
   * id so a second copy is impossible.
   *
   * The shapes are the adapter's own; `project.ts` maps the fields it needs
   * and carries the rest untouched.
   *
   * ONE PAGE OF ONE TABLE PER CALL (t-2026-10-06-21). The transport journal
   * grows by a row per request and held 154 506 rows on the Russian host on
   * 2026-10-06; answering with all of it, on every projection and on every
   * failed run, is a whole table held at once.
   */
  loadJournal: (
    deps: SyncDeps,
    page: JournalPage,
  ) => Promise<{
    runs: Record<string, unknown>[];
    calls: Record<string, unknown>[];
  }>;
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
  "credentialHowTo",
  "credentialSlot",
  "credentialFields",
  "syncKinds",
  "mirrorKinds",
  "runSync",
  "loadMirror",
  "loadJournal",
  "normalize",
] as const;
