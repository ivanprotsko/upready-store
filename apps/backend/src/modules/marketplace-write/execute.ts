import { createHash } from "node:crypto";
import { resolveWriteEndpoint, validateAdapter } from "./registry";
import {
  MarketplaceWriteRefused,
  type MarketplaceWriteAdapter,
  type MarketplaceWriteAuditRow,
  type MarketplaceWriteCall,
  type MarketplaceWriteContext,
  type MarketplaceWriteEndpoint,
  type MarketplaceWriteGate,
  type MarketplaceWriteRequest,
  type MarketplaceWriteResult,
} from "./types";

/**
 * The five gates, and the only path from "somebody asked for a mutation" to
 * "a socket was opened" (w20-wb-write-core).
 *
 * Checked in this order, all of them, before any adapter is allowed to send:
 *
 *   (a) credential   a WRITE credential exists in the adapter's own slot. The
 *                    read slot is never consulted here (Ivan, 02:46 WITA: the
 *                    read key may carry write rights by mistake, so it is not
 *                    the key a write may use);
 *   (b) usable       the adapter's own inspection of that credential passes.
 *                    For Wildberries: not expired and NOT marked read-only;
 *   (c) enabled      the tenant's switch for this marketplace is on;
 *   (d) consent      the owner has confirmed THIS operation class;
 *   (e) live         the process carries the adapter's live env var.
 *
 * Without (e) the call is a DRY RUN: the body is validated, one audit row is
 * written and nothing is sent. Today no deployment of this repository sets
 * that variable and no production code path calls this function at all, so
 * the answer is always `{ dryRun: true }`.
 *
 * Every outcome is journalled, refusals included. An attempt nobody can prove
 * afterwards would defeat the point, so `appendAudit` failing fails the call
 * (unlike the READ journal of w01, which swallows its errors).
 */

/** Response text kept in the journal. Enough to diagnose, bounded on purpose. */
const MAX_RESPONSE_CHARS = 2_000;

/** A marketplace answer that is not a 2xx. Never retried: see the head comment. */
export class MarketplaceWriteApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(endpointId: string, status: number, body: string) {
    super(`${endpointId} answered ${status}: ${body.slice(0, 500)}`);
    this.name = "MarketplaceWriteApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Substitutes `:name` placeholders. An unfilled one throws rather than
 * reaching the marketplace as a literal `:warehouseId`, which would be a
 * request to a path nobody reviewed.
 */
export const buildWritePath = (
  entry: MarketplaceWriteEndpoint,
  params: Record<string, string | number> = {},
): string => {
  const path = entry.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") {
      throw new MarketplaceWriteRefused(
        "body",
        `Write endpoint ${entry.id} needs path parameter ${name}, which was not supplied.`,
        entry.id,
      );
    }
    return encodeURIComponent(String(value));
  });

  if (path.includes(":")) {
    throw new MarketplaceWriteRefused(
      "body",
      `Write endpoint ${entry.id} has an unresolved path placeholder.`,
      entry.id,
    );
  }

  return path;
};

/** The payload fingerprint the audit row carries, so a body cannot be edited later. */
export const payloadSha256 = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");

export const marketplaceWrite = async (
  adapter: MarketplaceWriteAdapter,
  endpointId: string,
  call: MarketplaceWriteCall,
  ctx: MarketplaceWriteContext,
): Promise<MarketplaceWriteResult> => {
  // Cheap, and it keeps a hand-built adapter in a test as honest as the real
  // one: an adapter whose registry is broken never reaches a gate.
  validateAdapter(adapter);

  const entry = resolveWriteEndpoint(adapter, endpointId);
  const logger = ctx.logger ?? console;
  const env = ctx.env ?? process.env;
  const path = buildWritePath(entry, call.params);
  const sha = payloadSha256(call.body);

  const baseRow = (): Omit<MarketplaceWriteAuditRow, "dry_run" | "outcome" | "gate" | "status" | "response" | "error"> => ({
    tenant_id: ctx.tenantId,
    marketplace: adapter.marketplace,
    op_class: entry.opClass,
    endpoint_id: entry.id,
    method: entry.method,
    path,
    payload: call.body ?? null,
    payload_sha256: sha,
    actor: ctx.actor,
    created_at: new Date(),
  });

  /** Journals the refusal and hands back the error to throw. */
  const refusal = async (gate: MarketplaceWriteGate, message: string): Promise<MarketplaceWriteRefused> => {
    await ctx.store.appendAudit({
      ...baseRow(),
      dry_run: true,
      outcome: "refused",
      gate,
      status: null,
      response: null,
      error: message,
    });
    logger.warn(`[${adapter.marketplace}-write] refused ${entry.id} at gate ${gate}: ${message}`);
    return new MarketplaceWriteRefused(gate, message, entry.id);
  };

  // (a) The write credential, from the adapter's own slot.
  const credential = await ctx.store.readCredential(adapter.credentialSlot);
  if (!credential) {
    throw await refusal(
      "credential",
      `No ${adapter.marketplace} WRITE credential is stored for this shop (slot ` +
        `${adapter.credentialSlot}). The read key is a different secret and is never used to write.`,
    );
  }

  // (b) What that credential says about itself.
  const facts = adapter.inspectCredential(credential);
  if (!facts.usable) {
    throw await refusal(
      "credential_usable",
      facts.reason ?? `The stored ${adapter.marketplace} write credential cannot be used.`,
    );
  }

  // (c) The tenant's switch.
  if (!(await ctx.store.isEnabled())) {
    throw await refusal(
      "enabled",
      `Writing to ${adapter.marketplace} is switched off for this shop.`,
    );
  }

  // (d) The owner's consent for this class.
  const consent = await ctx.store.findConsent(entry.opClass);
  if (!consent) {
    throw await refusal(
      "consent",
      `The shop owner has not confirmed the operation class ${entry.opClass} for ` +
        `${adapter.marketplace}. Consent is given per class and never globally.`,
    );
  }

  // The body, against what the marketplace's own documentation says it is.
  const parsed = entry.bodySchema.safeParse(call.body);
  if (!parsed.success) {
    throw await refusal(
      "body",
      `The payload for ${entry.id} does not match the documented body (${entry.docUrl}): ` +
        JSON.stringify(parsed.error.issues ?? parsed.error).slice(0, 500),
    );
  }

  const request: MarketplaceWriteRequest = {
    endpoint: entry,
    path,
    url: `https://${entry.host}${path}`,
    method: entry.method,
    body: parsed.data,
  };

  // (e) The live gate. Absent it, nothing is sent.
  if (env[adapter.liveEnvVar] !== "1") {
    await ctx.store.appendAudit({
      ...baseRow(),
      payload: parsed.data ?? null,
      dry_run: true,
      outcome: "dry_run",
      gate: null,
      status: null,
      response: null,
      error: null,
    });
    logger.info(
      `[${adapter.marketplace}-write] DRY RUN ${entry.method} ${entry.host}${path} ` +
        `(${entry.opClass}, sha256 ${sha.slice(0, 12)}…): nothing was sent, ` +
        `${adapter.liveEnvVar} is not set.`,
    );
    return {
      endpointId: entry.id,
      opClass: entry.opClass,
      dryRun: true,
      method: entry.method,
      path,
      payloadSha256: sha,
      status: null,
      response: null,
    };
  }

  let response: { status: number; body: string };
  try {
    response = await adapter.send(request, credential);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.store.appendAudit({
      ...baseRow(),
      payload: parsed.data ?? null,
      dry_run: false,
      outcome: "sent",
      gate: null,
      status: null,
      response: null,
      error: message,
    });
    throw error;
  }

  const body = response.body.slice(0, MAX_RESPONSE_CHARS);
  const failed = response.status < 200 || response.status >= 300;

  try {
    await ctx.store.appendAudit({
      ...baseRow(),
      payload: parsed.data ?? null,
      dry_run: false,
      outcome: "sent",
      gate: null,
      status: response.status,
      response: body,
      error: failed ? `HTTP ${response.status}` : null,
    });
  } catch (error) {
    // The request DID leave the process. Say so loudly rather than let the
    // journal failure read as "nothing happened" (rule 20a).
    logger.warn(
      `[${adapter.marketplace}-write] ${entry.method} ${entry.host}${path} WAS SENT and answered ` +
        `${response.status}, but the audit row could not be written: ` +
        (error instanceof Error ? error.message : String(error)),
    );
    throw error;
  }

  if (failed) {
    // Nothing is retried: a 4xx on a mutation means the payload was wrong, and
    // repeating a 5xx risks a double write. The caller decides.
    throw new MarketplaceWriteApiError(entry.id, response.status, body);
  }

  logger.info(
    `[${adapter.marketplace}-write] SENT ${entry.method} ${entry.host}${path} -> ${response.status} ` +
      `(${entry.opClass}, consent by ${consent.confirmed_by})`,
  );

  return {
    endpointId: entry.id,
    opClass: entry.opClass,
    dryRun: false,
    method: entry.method,
    path,
    payloadSha256: sha,
    status: response.status,
    response: body,
  };
};
