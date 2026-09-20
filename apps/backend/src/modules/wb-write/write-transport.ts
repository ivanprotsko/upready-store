import { marketplaceWrite } from "../marketplace-write/execute";
import { validateAdapter } from "../marketplace-write/registry";
import type {
  MarketplaceCredentialBag,
  MarketplaceCredentialFacts,
  MarketplaceWriteAdapter,
  MarketplaceWriteCall,
  MarketplaceWriteContext,
  MarketplaceWriteRequest,
  MarketplaceWriteResponse,
  MarketplaceWriteResult,
} from "../marketplace-write/types";
import { inspectToken, WB_READ_ONLY_BIT } from "../wb/token";
import {
  WB_MARKETPLACE,
  WB_WRITE_ENDPOINTS,
  WB_WRITE_HOST_SUFFIX,
} from "./write-endpoints";

/**
 * The ONLY file in this repository that may send a MUTATION to Wildberries
 * (w20-wb-write-core).
 *
 * `src/modules/wb/transport.ts` is the only file that may send a READ, and the
 * two are siblings by design: a caller names a registry entry, the method and
 * the host come from that entry, and neither module exports a `fetch`, a
 * client, a base URL or a "raw request" helper. There is no escape hatch to
 * find in either.
 *
 * What is different here is that `send` is unreachable until the write core
 * has opened five gates (`../marketplace-write/execute.ts`), and the last one
 * is `WB_WRITE_LIVE=1` in the process environment. No deployment of this
 * repository sets it, no production code path calls `wbWrite`, and the shops
 * have no `wildberries_write` credential to begin with. Today this file can
 * only ever journal a dry run.
 *
 * Ivan's order, 2026-09-16 02:46 WITA: "…если ассистент создававший ключи по
 * ошибке выдал права не только на чтение, а еще и на запись, то исключить
 * ситуацию что какая-то запись будет выполнена на WB." Hence gate (a) reads a
 * SEPARATE slot and gate (b) refuses a key that is marked read-only or
 * expired — a read key cannot become a write key by accident.
 */

/** One request, including reading the answer. A mutation is never retried. */
export const WB_WRITE_TIMEOUT_MS = 20_000;

/** The env var that turns a dry run into a request. Set nowhere. */
export const WB_WRITE_LIVE_ENV = "WB_WRITE_LIVE";

/**
 * Gate (b) for Wildberries: what the stored key says about itself, decoded
 * from the JWT payload against WB's own documented bit table (`../wb/token.ts`,
 * w01). No network, no signature check, no memory: a key whose mask cannot be
 * read is refused rather than assumed harmless.
 */
export const inspectWbWriteCredential = (
  credential: MarketplaceCredentialBag,
): MarketplaceCredentialFacts => {
  const key = typeof credential.api_key === "string" ? credential.api_key : "";

  if (!key) {
    return {
      usable: false,
      reason: "The stored Wildberries write credential has no `api_key` field.",
    };
  }

  const facts = inspectToken(key);

  if (facts.readOnly === "unknown") {
    return {
      usable: false,
      reason:
        `The Wildberries write key's access mask could not be read (${facts.error ?? "no `s` field"}), ` +
        "so it cannot be shown NOT to be a read-only key. Refused.",
    };
  }

  if (facts.expired) {
    return {
      usable: false,
      reason: `The Wildberries write key expired on ${facts.expiresAt}.`,
      details: { expiresAt: facts.expiresAt },
    };
  }

  if (facts.readOnly === true) {
    return {
      usable: false,
      reason:
        `The key in the write slot is marked read-only (bit ${WB_READ_ONLY_BIT}, "${facts.docUrl}"). ` +
        "A read-only key cannot write, and this platform does not try.",
      details: { mask: facts.mask },
    };
  }

  return {
    usable: true,
    reason: null,
    details: {
      tokenId: facts.tokenId,
      sellerId: facts.sellerId,
      kind: facts.kind,
      sandbox: facts.sandbox,
      mask: facts.mask,
      expiresAt: facts.expiresAt,
    },
  };
};

/**
 * The one socket. Reached only from `marketplaceWrite`, and only with all five
 * gates open. Nothing is retried: a 4xx means the payload was wrong and
 * repeating a 5xx risks a double write.
 */
const sendWbWrite = async (
  request: MarketplaceWriteRequest,
  credential: MarketplaceCredentialBag,
): Promise<MarketplaceWriteResponse> => {
  const headers: Record<string, string> = {
    Authorization: String(credential.api_key),
    Accept: "application/json",
  };
  if (request.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: AbortSignal.timeout(request.endpoint.timeoutMs ?? WB_WRITE_TIMEOUT_MS),
  });

  return { status: response.status, body: await response.text() };
};

/** The Wildberries write adapter. Validated at load, like the registry. */
export const WB_WRITE_ADAPTER: MarketplaceWriteAdapter = {
  marketplace: WB_MARKETPLACE,
  credentialSlot: "wildberries_write",
  // The w01 read slot. Named here so the core can refuse an adapter that ever
  // tries to write with the key the shop reads with.
  forbiddenSlots: ["wildberries"],
  liveEnvVar: WB_WRITE_LIVE_ENV,
  hostSuffix: WB_WRITE_HOST_SUFFIX,
  endpoints: WB_WRITE_ENDPOINTS,
  inspectCredential: inspectWbWriteCredential,
  send: sendWbWrite,
};

validateAdapter(WB_WRITE_ADAPTER);

/**
 * The one WB write. `endpointId` names an entry of `WB_WRITE_ENDPOINTS`; the
 * method, host and path come from that entry and from nowhere else.
 *
 * Returns `{ dryRun: true }` unless every gate is open. Nothing in this
 * repository calls it outside tests
 * (`__tests__/no-live-write-call-site.unit.spec.ts`).
 */
export const wbWrite = (
  endpointId: string,
  call: MarketplaceWriteCall,
  ctx: MarketplaceWriteContext,
): Promise<MarketplaceWriteResult> => marketplaceWrite(WB_WRITE_ADAPTER, endpointId, call, ctx);
