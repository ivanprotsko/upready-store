import type { ZodType } from "zod";

/**
 * The vocabulary of the marketplace WRITE core (w20-wb-write-core).
 *
 * Ivan's order, 2026-09-16 02:46 WITA: a key issued for reading may carry
 * write rights by mistake, so nothing may reach a marketplace unless we meant
 * it. Ivan's order of 04:44 WITA adds the second requirement: design every
 * marketplace feature so the Ozon twin is an adapter and not a copy.
 *
 * Hence this module. It owns the gates, the audit journal and the consent
 * ledger; an adapter (`src/modules/wb-write`, later `ozon-write`) owns the
 * registry of its own mutations, its credential slot and the one function that
 * opens a socket. No adapter re-implements a gate.
 *
 * The read side stays what w01 made it: `src/modules/wb/` cannot express a
 * write at all. This module does not import it and does not widen it.
 */

/**
 * The classes the owner consents to, one at a time. A consent is per class and
 * never global: "update my stock" is not "answer my customers".
 */
export const MARKETPLACE_WRITE_OP_CLASSES = [
  "stocks",
  "prices",
  "feedback_answers",
  "fbs_orders",
] as const;

export type MarketplaceWriteOpClass = (typeof MARKETPLACE_WRITE_OP_CLASSES)[number];

/** The verbs a mutation may use. A read never travels through this module. */
export const MARKETPLACE_WRITE_METHODS = ["PUT", "POST", "PATCH", "DELETE"] as const;

export type MarketplaceWriteMethod = (typeof MARKETPLACE_WRITE_METHODS)[number];

/**
 * One registered mutation. Everything a request is built from lives here and
 * nowhere else: a caller names an `id` and supplies values, never a method, a
 * host or a URL.
 */
export type MarketplaceWriteEndpoint = {
  /** Stable id a caller names, e.g. `wb.stocks.update`. */
  id: string;
  /** Which adapter owns it. Copied into every audit row. */
  marketplace: string;
  method: MarketplaceWriteMethod;
  /** Host without a scheme. Checked against the adapter's own suffix. */
  host: string;
  /** Path with `:name` placeholders, filled from `params`. */
  path: string;
  /** The consent class this mutation belongs to. */
  opClass: MarketplaceWriteOpClass;
  /** The documentation page this entry was read from. Required. */
  docUrl: string;
  /** The method's title in the marketplace's documentation. */
  summary: string;
  /** What the marketplace's docs say the body must be. Required. */
  bodySchema: ZodType;
  /** `true` where the docs call the action irreversible. Shown to the owner. */
  irreversible?: boolean;
  /** Overrides the adapter's default request timeout. */
  timeoutMs?: number;
};

/** A registry that cannot be trusted is a registry that fails at load. */
export class MarketplaceWriteRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceWriteRegistryError";
  }
}

/** The gates, in the order they are checked. The name reaches the audit row. */
export const MARKETPLACE_WRITE_GATES = [
  "credential",
  "credential_usable",
  "enabled",
  "consent",
  "body",
] as const;

export type MarketplaceWriteGate = (typeof MARKETPLACE_WRITE_GATES)[number];

/**
 * A refusal. Never a network error: by the time this is thrown nothing has
 * been sent, and `gate` says which of the five conditions was not met.
 */
export class MarketplaceWriteRefused extends Error {
  readonly gate: MarketplaceWriteGate | "registry";
  readonly endpointId: string | null;

  constructor(gate: MarketplaceWriteGate | "registry", message: string, endpointId: string | null = null) {
    super(message);
    this.name = "MarketplaceWriteRefused";
    this.gate = gate;
    this.endpointId = endpointId;
  }
}

/**
 * A credential as it is stored: the decrypted `tenant_integration_secret`
 * payload of one slot. WB carries one field (`api_key`); Ozon needs two
 * (`client_id`, `api_key`), which is why this is a bag and not a string.
 */
export type MarketplaceCredentialBag = Record<string, unknown>;

/** What an adapter can tell about its own credential without calling anybody. */
export type MarketplaceCredentialFacts = {
  /** `false` blocks the write at gate (b), whatever the other gates say. */
  usable: boolean;
  /** Why not, in the owner's terms. `null` when usable. */
  reason: string | null;
  /** Anything the adapter wants in the log line. Never the credential itself. */
  details?: Record<string, unknown>;
};

/** The request an adapter is handed. Built by the core, never by the caller. */
export type MarketplaceWriteRequest = {
  endpoint: MarketplaceWriteEndpoint;
  /** Path with the placeholders already substituted. */
  path: string;
  url: string;
  method: MarketplaceWriteMethod;
  /** The validated body, or `undefined` for a body-less mutation. */
  body: unknown;
};

export type MarketplaceWriteResponse = {
  status: number;
  /** The response text, truncated by the core before it reaches the journal. */
  body: string;
};

/**
 * What a marketplace has to provide to become writable. Four things and a
 * registry: no adapter gets to decide WHETHER to check a gate.
 */
export type MarketplaceWriteAdapter = {
  /** `wb`, later `ozon`. Stored on every audit and consent row. */
  marketplace: string;
  /** The tenant-secrets slot holding the WRITE credential. */
  credentialSlot: string;
  /**
   * Slots this adapter must never read. The WB read key lives in
   * `wildberries`, and the whole point of w20 is that a write cannot borrow
   * it — so the core refuses an adapter that names its read slot here and
   * then asks for it (`assertAdapter`).
   */
  forbiddenSlots: readonly string[];
  /** The process env var that turns a dry run into a real request. */
  liveEnvVar: string;
  /** Host suffix every registered endpoint must live under. */
  hostSuffix: string;
  endpoints: readonly MarketplaceWriteEndpoint[];
  /** Gate (b). Pure: reads the credential, calls nobody. */
  inspectCredential: (credential: MarketplaceCredentialBag) => MarketplaceCredentialFacts;
  /** The ONE place a socket is opened. Called only when all gates are open. */
  send: (
    request: MarketplaceWriteRequest,
    credential: MarketplaceCredentialBag,
  ) => Promise<MarketplaceWriteResponse>;
};

export type MarketplaceWriteConsent = {
  op_class: MarketplaceWriteOpClass;
  confirmed_by: string;
  confirmed_at: Date | string;
  note: string | null;
};

/** What ends up in `marketplace_write_audit`. One row per attempt, always. */
export type MarketplaceWriteAuditRow = {
  tenant_id: string;
  marketplace: string;
  op_class: MarketplaceWriteOpClass;
  endpoint_id: string;
  method: string;
  path: string;
  /** The body as the caller meant it. Never a credential: none is in a body. */
  payload: unknown;
  payload_sha256: string;
  /** `true` when nothing left this process. Refusals count as dry runs. */
  dry_run: boolean;
  outcome: "refused" | "dry_run" | "sent";
  /** Which gate refused, for `outcome = "refused"`. */
  gate: string | null;
  actor: string;
  status: number | null;
  response: string | null;
  error: string | null;
  created_at: Date;
};

/**
 * Everything the core needs from the outside world, per tenant. The Medusa
 * implementation is `medusa-store.ts`; a test passes its own object, which is
 * why the gates are testable without a database.
 */
export type MarketplaceWriteStore = {
  /** The credential in `slot`, or `null`. Only the write slot is ever asked for. */
  readCredential: (slot: string) => Promise<MarketplaceCredentialBag | null>;
  /** Gate (c): the tenant's switch for this marketplace. */
  isEnabled: () => Promise<boolean>;
  /** Gate (d): the owner's consent row for this class, or `null`. */
  findConsent: (opClass: MarketplaceWriteOpClass) => Promise<MarketplaceWriteConsent | null>;
  /**
   * Appends one audit row. Unlike the READ journal of w01, a failure here
   * fails the operation: a mutation nobody can prove afterwards is exactly
   * what this module exists to prevent.
   */
  appendAudit: (row: MarketplaceWriteAuditRow) => Promise<void>;
};

export type MarketplaceWriteContext = {
  tenantId: string;
  /** Who asked. A tenant admin id, or a script name. Stored on the audit row. */
  actor: string;
  store: MarketplaceWriteStore;
  /** Defaults to `process.env`. The live gate (e) is read from here. */
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "info" | "warn">;
};

export type MarketplaceWriteCall = {
  params?: Record<string, string | number>;
  body?: unknown;
};

export type MarketplaceWriteResult = {
  endpointId: string;
  opClass: MarketplaceWriteOpClass;
  /** `true` when nothing was sent. The only value this repository produces today. */
  dryRun: boolean;
  method: MarketplaceWriteMethod;
  path: string;
  payloadSha256: string;
  status: number | null;
  response: unknown;
};
