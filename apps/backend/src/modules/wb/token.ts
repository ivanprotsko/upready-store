/**
 * What a WB API key says about itself (w01-wb-readonly-client).
 *
 * The key is a JWT (RFC 7519). Its payload is readable without any secret, and
 * WB documents every field we use here, so nothing in this file comes from
 * memory (rule 17a). Source, read 2026-09-16 through a headed Chrome because
 * the portal answers curl with HTTP 498:
 *   https://dev.wildberries.ru/en/docs/openapi/api-information#tag/authorization/About-the-token
 * Extracted text kept at
 *   artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-openapi-api-information.txt
 *
 * The signature is NOT verified: we hold no WB public key, and this is not an
 * authentication decision. It is a description of a key we were handed, shown
 * to the shop owner. WB itself is the only judge of whether the key works.
 */

export const WB_TOKEN_DOC_URL =
  "https://dev.wildberries.ru/en/docs/openapi/api-information#tag/authorization/About-the-token";

/**
 * The `s` bitmask, verbatim from the doc table "Bit values" (column
 * "Property (if bit is 1)"). Bits 7, 8, 14, 15 and everything above 16 other
 * than 30 are absent from that table and are reported as unknown rather than
 * guessed.
 */
export const WB_TOKEN_BITS: Readonly<Record<number, string>> = {
  1: "Access to Content",
  2: "Access to Analytics",
  3: "Access to Prices and discounts",
  4: "Access to Marketplace",
  5: "Access to Statistics",
  6: "Access to Promotion",
  7: "Access to Feedbacks and Questions",
  9: "Access to Buyers chat",
  10: "Access to Supplies",
  11: "Access to Buyers returns",
  12: "Access to Documents",
  13: "Access to Finance",
  16: "Access to Users",
  30: "Read only token",
};

/** The bit the doc table calls "Read only token". */
export const WB_READ_ONLY_BIT = 30;

/** Days before expiry at which the owner should be warned to reissue the key. */
export const WB_EXPIRY_WARNING_DAYS = 14;

/** A named category (w13-wb-readonly-flag): every documented bit but 30, which is the read-only flag, not a category. */
export type WbTokenCategory = { bit: number; name: string; granted: boolean };

const CATEGORY_BITS = Object.keys(WB_TOKEN_BITS)
  .map(Number)
  .filter((bit) => bit !== WB_READ_ONLY_BIT)
  .sort((a, b) => a - b);

/**
 * Every documented category with whether this mask grants it, so the panel
 * can show granted AND denied marks rather than only the granted list
 * (w13-wb-readonly-flag). `mask: null` (an unreadable key) grants nothing.
 */
export const tokenCategories = (mask: number | null): WbTokenCategory[] =>
  CATEGORY_BITS.map((bit) => ({
    bit,
    name: WB_TOKEN_BITS[bit],
    granted: mask === null ? false : ((mask >>> bit) & 1) === 1,
  }));

/**
 * `acc` + `t`, from the doc table "Token fields". `for` is only present on the
 * personal and service kinds and is not needed to tell them apart here.
 */
const TOKEN_KINDS: Record<number, string> = {
  1: "base",
  2: "test",
  3: "personal",
  4: "service",
};

export type WbTokenBit = { bit: number; meaning: string | null };

export type WbTokenFacts = {
  /** `id` — the token's own UUIDv4. Not a secret: it identifies, it does not authorise. */
  tokenId: string | null;
  /** `sid` — the Wildberries seller ID. */
  sellerId: string | null;
  /** `oid` — present in the payload; WB calls the remaining fields internal. */
  oid: number | null;
  /** `exp` as an ISO string, and whether it has already passed. */
  expiresAt: string | null;
  expired: boolean;
  /** Whole days until `exp`, floored; `null` when `exp` is unreadable. Negative once expired. */
  expiresInDays: number | null;
  /** `true` only when the key is not yet expired and expires within `WB_EXPIRY_WARNING_DAYS`. */
  expiringSoon: boolean;
  /** `t`: true means a sandbox (test) token. */
  sandbox: boolean | null;
  /** `acc` mapped through the doc's "Token fields" table. */
  kind: string | null;
  /** The raw `s` value and the bits set in it. */
  mask: number | null;
  bits: WbTokenBit[];
  /** Every documented category, granted and denied alike (w13-wb-readonly-flag). */
  categories: WbTokenCategory[];
  /**
   * `true` only when bit 30 is set, `false` only when `s` was readable and the
   * bit is clear, and `"unknown"` when the payload could not be read at all.
   * Never `true` from memory (rule 17a).
   */
  readOnly: true | false | "unknown";
  /** Where the bit meanings come from, carried into the API response. */
  docUrl: string;
  /** Set when the payload could not be decoded; the caller shows it as is. */
  error: string | null;
};

const UNREADABLE = (error: string): WbTokenFacts => ({
  tokenId: null,
  sellerId: null,
  oid: null,
  expiresAt: null,
  expired: false,
  expiresInDays: null,
  expiringSoon: false,
  sandbox: null,
  kind: null,
  mask: null,
  bits: [],
  categories: tokenCategories(null),
  readOnly: "unknown",
  docUrl: WB_TOKEN_DOC_URL,
  error,
});

/** The bits set in `mask`, each with its documented meaning or `null`. */
export const maskBits = (mask: number): WbTokenBit[] => {
  const bits: WbTokenBit[] = [];
  for (let bit = 0; bit < 32; bit += 1) {
    if ((mask >>> bit) & 1) {
      bits.push({ bit, meaning: WB_TOKEN_BITS[bit] ?? null });
    }
  }
  return bits;
};

/**
 * Decodes the payload of a WB key. Never throws: an unreadable key is a fact
 * to report, and the caller (`GET /tenants/wb/status`) has to render it.
 */
export const inspectToken = (key: string | null | undefined): WbTokenFacts => {
  if (!key) {
    return UNREADABLE("No WB key is stored for this shop.");
  }

  const parts = key.split(".");
  if (parts.length !== 3) {
    return UNREADABLE("The stored WB key is not a three-part JWT.");
  }

  let payload: Record<string, unknown>;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    payload = JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    return UNREADABLE(
      `The WB key payload could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mask = typeof payload.s === "number" ? payload.s : null;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const acc = typeof payload.acc === "number" ? payload.acc : null;

  const expired = exp === null ? false : exp * 1000 <= Date.now();
  const expiresInDays =
    exp === null ? null : Math.floor((exp * 1000 - Date.now()) / (24 * 60 * 60 * 1000));

  return {
    tokenId: typeof payload.id === "string" ? payload.id : null,
    sellerId: typeof payload.sid === "string" ? payload.sid : null,
    oid: typeof payload.oid === "number" ? payload.oid : null,
    expiresAt: exp === null ? null : new Date(exp * 1000).toISOString(),
    expired,
    expiresInDays,
    expiringSoon: !expired && expiresInDays !== null && expiresInDays < WB_EXPIRY_WARNING_DAYS,
    sandbox: typeof payload.t === "boolean" ? payload.t : null,
    kind: acc === null ? null : TOKEN_KINDS[acc] ?? null,
    mask,
    bits: mask === null ? [] : maskBits(mask),
    categories: tokenCategories(mask),
    readOnly: mask === null ? "unknown" : ((mask >>> WB_READ_ONLY_BIT) & 1) === 1,
    docUrl: WB_TOKEN_DOC_URL,
    error: mask === null ? "The WB key payload carries no numeric `s` field." : null,
  };
};

/**
 * The one WARNING line the module logs on boot when the key is not marked
 * read-only. It is a warning and not a refusal: the transport cannot write
 * whatever the key allows, so a write-capable key is a thing to tell the owner
 * about, not a reason to stop reading.
 */
export const readOnlyWarning = (facts: WbTokenFacts): string | null => {
  if (facts.readOnly === true) {
    return null;
  }
  const state = facts.readOnly === "unknown" ? "could not be read" : "is NOT set";
  const granted = facts.categories.filter((category) => category.granted).map((category) => category.name);
  const scopeNote = granted.length ? ` The key also grants: ${granted.join(", ")}.` : "";
  return (
    `[wb] WARNING: the stored Wildberries key's read-only bit (${WB_READ_ONLY_BIT}) ${state}.${scopeNote} ` +
    "This client still cannot write to WB: src/modules/wb/transport.ts only sends registered " +
    `reads. See ${WB_TOKEN_DOC_URL}`
  );
};
