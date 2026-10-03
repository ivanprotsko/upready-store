import { createHash } from "node:crypto";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv, maskSecret, type MaskedSecret } from "./crypto";

/**
 * Robokassa credentials of ONE shop, the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "robokassa"`.
 *
 * Password #1 signs the payment URL, password #2 signs the Result webhook; the
 * test pair does the same in Robokassa's test mode (`IsTest=1`). All four are
 * issued in the merchant's Robokassa dashboard for the shop's MerchantLogin.
 *
 * `fiscalization_enabled`/`sno`/`default_tax` are t-cherk-30: the 54-FZ
 * receipt (`Receipt`) Robokassa prints is mandatory for an ИП and off by
 * default for a shop that predates this field (`withFiscalizationDefaults`
 * below fills them in for a row encrypted before this task).
 */
export type RobokassaCredentials = {
  merchant_login: string;
  password1: string;
  password2: string;
  test_password1: string;
  test_password2: string;
  hash_algorithm: RobokassaHashAlgorithm;
  fiscalization_enabled: boolean;
  sno: RobokassaSno;
  default_tax: RobokassaTax;
};

export const ROBOKASSA_HASH_ALGORITHMS = ["md5", "sha256", "sha384", "sha512"] as const;
export type RobokassaHashAlgorithm = (typeof ROBOKASSA_HASH_ALGORITHMS)[number];

/** Taxation system Robokassa prints on the receipt (`Receipt.sno`, fiscalization doc). */
export const ROBOKASSA_SNO_VALUES = ["osn", "usn_income", "usn_income_outcome", "esn", "patent"] as const;
export type RobokassaSno = (typeof ROBOKASSA_SNO_VALUES)[number];

/**
 * `Receipt.items[].tax`, the fiscalization doc's own enum. `vatNN0`/`vatNN2`
 * are the "calculated rate" pair for a price that already includes VAT
 * (10/110, 20/120, 5/105 and so on); `vat22`/`vat122` are the 2026 standard
 * and calculated rates.
 */
export const ROBOKASSA_TAX_VALUES = [
  "none",
  "vat0",
  "vat10",
  "vat20",
  "vat110",
  "vat120",
  "vat5",
  "vat7",
  "vat105",
  "vat107",
  "vat22",
  "vat122",
] as const;
export type RobokassaTax = (typeof ROBOKASSA_TAX_VALUES)[number];

/** `Receipt.items[].payment_object`, the fiscalization doc's own enum. */
export const ROBOKASSA_PAYMENT_OBJECT_VALUES = [
  "commodity",
  "excise",
  "job",
  "service",
  "gambling_bet",
  "gambling_prize",
  "lottery",
  "lottery_prize",
  "intellectual_activity",
  "payment",
  "agent_commission",
  "composite",
  "resort_fee",
  "another",
  "property_right",
  "non-operating_gain",
  "insurance_premium",
  "sales_tax",
  "tovar_mark",
] as const;
export type RobokassaPaymentObject = (typeof ROBOKASSA_PAYMENT_OBJECT_VALUES)[number];

/**
 * `Receipt.items[].payment_method`. Fixed by the brief rather than a panel
 * field: every line of this checkout is paid for in full at the moment the
 * order is placed, so there is no other value this shop would ever send.
 */
export const ROBOKASSA_RECEIPT_PAYMENT_METHOD = "full_payment" as const;

export const ROBOKASSA_FISCALIZATION_DEFAULTS: Pick<
  RobokassaCredentials,
  "fiscalization_enabled" | "sno" | "default_tax"
> = {
  fiscalization_enabled: false,
  sno: "osn",
  default_tax: "none",
};

/**
 * A row encrypted before t-cherk-30 decrypts without `fiscalization_enabled`/
 * `sno`/`default_tax` — there is no migration for an encrypted JSON blob, so
 * every reader fills the three in here, once, rather than each guessing its
 * own default.
 */
const withFiscalizationDefaults = (credentials: RobokassaCredentials): RobokassaCredentials => ({
  ...ROBOKASSA_FISCALIZATION_DEFAULTS,
  ...credentials,
});

/** The secret fields of {@link RobokassaCredentials}, the ones every read masks. */
export const ROBOKASSA_SECRET_FIELDS = [
  "password1",
  "password2",
  "test_password1",
  "test_password2",
] as const;

export type RobokassaSecretField = (typeof ROBOKASSA_SECRET_FIELDS)[number];

export type ResolvedRobokassaSecret = {
  id: string;
  tenant_id: string;
  is_test: boolean;
  is_enabled: boolean;
  credentials: RobokassaCredentials;
};

export type MaskedRobokassaSettings = {
  id: string;
  provider: "robokassa";
  is_test: boolean;
  is_enabled: boolean;
  merchant_login: string;
  hash_algorithm: RobokassaHashAlgorithm;
  password1: MaskedSecret;
  password2: MaskedSecret;
  test_password1: MaskedSecret;
  test_password2: MaskedSecret;
  /** t-cherk-30: none of these three are secret, so they come back in the open. */
  fiscalization_enabled: boolean;
  sno: RobokassaSno;
  default_tax: RobokassaTax;
};

/** The masked view a route returns. Built here so no route can forget a field. */
export const maskRobokassaSettings = (row: ResolvedRobokassaSecret): MaskedRobokassaSettings => ({
  id: row.id,
  provider: "robokassa",
  is_test: row.is_test,
  is_enabled: row.is_enabled,
  merchant_login: row.credentials.merchant_login,
  hash_algorithm: row.credentials.hash_algorithm,
  password1: maskSecret(row.credentials.password1),
  password2: maskSecret(row.credentials.password2),
  test_password1: maskSecret(row.credentials.test_password1),
  test_password2: maskSecret(row.credentials.test_password2),
  fiscalization_enabled: row.credentials.fiscalization_enabled,
  sno: row.credentials.sno,
  default_tax: row.credentials.default_tax,
});

/**
 * Reads the shop's Robokassa row straight off the shared Postgres connection.
 *
 * Why SQL and not the tenant module service: the payment provider
 * (`src/modules/payment-robokassa`) runs inside the payment module's container,
 * which carries `__pg_connection__` (`@medusajs/modules-sdk`
 * `loaders/utils/load-internal.js`, the module dependency list) but no other
 * module's service. One reader for the provider and the routes keeps the two
 * from drifting: a column added here is read by both or by neither.
 *
 * Returns `null` when the shop has no row, a soft-deleted row, or a disabled
 * one; the caller decides whether that is a 404, an empty checkout, or an error.
 */
export const readRobokassaSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedRobokassaSecret | null> => {
  const query = pg("tenant_integration_secret")
    .select("id", "tenant_id", "payload", "is_test", "is_enabled")
    .where({ tenant_id: tenantId, provider: "robokassa" })
    .whereNull("deleted_at")
    .first();

  const row = (await query) as
    | { id: string; tenant_id: string; payload: string; is_test: boolean; is_enabled: boolean }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  const credentials = withFiscalizationDefaults(decryptJson<RobokassaCredentials>(row.payload, keyFromEnv()));

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    is_test: row.is_test,
    is_enabled: row.is_enabled,
    credentials,
  };
};

/**
 * `readRobokassaSecret` for a PUBLIC path (46df A-02): a wrong `INTEGRATION_ENCRYPTION_KEY`, a
 * restored database on a different one, or a tampered row makes `decryptJson` throw, and that
 * throw used to reach `GET /storefront/by-host` uncaught — the resolver 500s, the storefront gets
 * no publishable key, and the WHOLE shop stops opening over one shop's one bad Robokassa secret.
 * Here the decrypt failure is caught, logged once at `warn` (never the payload, never the key),
 * and the shop reads as "Robokassa not connected" instead — the same shape `readRobokassaSecret`
 * already returns for "no row"/"disabled row", so every existing caller of THIS function needs no
 * further change. An owner-authenticated panel route (`/tenants/payment-settings`) should keep
 * calling `readRobokassaSecret` directly and let the error surface, so the owner is told the key
 * needs re-entering rather than silently seeing "not connected" (finding's own point 4; the panel
 * message itself is out of this task's scope — see the report).
 */
export const readRobokassaSecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedRobokassaSecret | null> => {
  try {
    return await readRobokassaSecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `Robokassa secret for tenant ${tenantId} could not be decrypted; treating Robokassa as not connected on this public read (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
};

/**
 * Robokassa's signature: the listed values joined with `:` and hashed with the
 * merchant's chosen algorithm, hex. Empty values are dropped from the join,
 * exactly as `@gorgo/medusa-payment-robokassa`'s `createSignature` does (read
 * from the old project's installed copy), because Robokassa builds its own
 * check the same way. Custom `Shp_*` parameters go LAST, as `name=value`,
 * sorted by name.
 */
export const robokassaSignature = (
  parts: Array<string | number | null | undefined>,
  algorithm: RobokassaHashAlgorithm,
): string =>
  createHash(algorithm)
    .update(parts.filter((part) => part !== undefined && part !== null && part !== "").join(":"))
    .digest("hex");

/** Robokassa sends `SignatureValue` in uppercase hex; the comparison ignores case. */
export const signaturesEqual = (expected: string, incoming: string | null | undefined): boolean =>
  expected.toLowerCase() === String(incoming ?? "").toLowerCase();

/** Password #1 or #2 of the pair the shop's mode selects. */
export const passwordFor = (
  secret: Pick<ResolvedRobokassaSecret, "is_test" | "credentials">,
  which: 1 | 2,
): string => {
  const { credentials, is_test } = secret;
  if (which === 1) {
    return is_test ? credentials.test_password1 : credentials.password1;
  }
  return is_test ? credentials.test_password2 : credentials.password2;
};

/**
 * `OutSum` as Robokassa expects it and as it echoes it back: two decimals,
 * dot as the separator. The webhook signature is over the STRING Robokassa
 * sends, so the string is stored on the session and compared verbatim.
 */
export const formatOutSum = (amount: number | string): string => Number(amount).toFixed(2);

/**
 * `InvId` must be a positive integer below 2^31. A hash of the payment session
 * id gives a stable, collision-resistant value without a counter shared across
 * shops; the last nine decimal digits of a SHA-256 keep it inside the range.
 */
export const invoiceIdFor = (sessionId: string): string => {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  const numeric = BigInt(`0x${digest.slice(0, 16)}`) % 2_000_000_000n;
  return String(numeric === 0n ? 1n : numeric);
};

export const ROBOKASSA_PAYMENT_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";

/**
 * The Result webhook's own fields. Robokassa posts them as
 * `application/x-www-form-urlencoded`; the values are strings.
 */
export type RobokassaResultPayload = {
  OutSum?: string;
  InvId?: string;
  SignatureValue?: string;
  Shp_SessionID?: string;
  [key: string]: unknown;
};

/**
 * Verifies a Result webhook against the shop's password #2:
 * `OutSum:InvId:Password#2:Shp_SessionID=<id>`.
 */
export const verifyResultSignature = (
  payload: RobokassaResultPayload,
  secret: ResolvedRobokassaSecret,
): boolean => {
  const expected = robokassaSignature(
    [payload.OutSum, payload.InvId, passwordFor(secret, 2), `Shp_SessionID=${payload.Shp_SessionID}`],
    secret.credentials.hash_algorithm,
  );
  return signaturesEqual(expected, payload.SignatureValue);
};

/**
 * Verifies the SuccessUrl2 redirect Robokassa sends the BROWSER through, signed
 * with password #1. This is proof the redirect is genuine, not proof of a
 * payment: the order is marked paid only by the Result webhook
 * (`src/api/robokassa/result/route.ts`).
 */
export const verifySuccessSignature = (
  payload: RobokassaResultPayload,
  secret: ResolvedRobokassaSecret,
): boolean => {
  const expected = robokassaSignature(
    [payload.OutSum, payload.InvId, passwordFor(secret, 1), `Shp_SessionID=${payload.Shp_SessionID}`],
    secret.credentials.hash_algorithm,
  );
  return signaturesEqual(expected, payload.SignatureValue);
};

/**
 * One line of a `Receipt` before it is built: a cart item or the shipping
 * line, with the tax and the discount Medusa already applied folded into
 * `amount` (`src/api/store/tenant/robokassa.ts` reads these off the cart via
 * `query.graph`, which is why this file never touches a cart itself).
 */
export type RobokassaReceiptLineInput = {
  /** Truncated to Robokassa's 128-character limit by `buildRobokassaReceipt`, not here. */
  name: string;
  quantity: number;
  /** Decimal RUB, this line's own final payable amount. */
  amount: number;
  kind: "item" | "shipping";
};

export type RobokassaReceiptItem = {
  name: string;
  quantity: number;
  sum: number;
  payment_method: typeof ROBOKASSA_RECEIPT_PAYMENT_METHOD;
  payment_object: RobokassaPaymentObject;
  tax: RobokassaTax;
};

export type RobokassaReceipt = {
  sno: RobokassaSno;
  items: RobokassaReceiptItem[];
};

/**
 * Robokassa's `Receipt` (fiscalization doc, "Как передавать Receipt"): one
 * item per cart line plus one for shipping (`payment_object: "service"`
 * there, `"commodity"` for every other line). Robokassa's own fiscal check
 * refuses a `Receipt` whose items do not sum to `OutSum`, so `sum` is rounded
 * to the kopeck independently per line and the residual — Medusa already
 * prorates a cart-wide discount into each line's own total, so there is
 * nothing left to distribute except the rounding itself — is folded into the
 * LAST line, the usual "largest remainder" fix for a set of roundings that
 * must add up to a fixed total.
 *
 * `null` when every line rounds to zero (a fully gift-carded cart, say):
 * Robokassa accepts no `Receipt` at all better than one with a zero-sum item.
 */
export const buildRobokassaReceipt = (input: {
  lines: RobokassaReceiptLineInput[];
  outSum: number | string;
  sno: RobokassaSno;
  tax: RobokassaTax;
}): RobokassaReceipt | null => {
  const lines = input.lines.filter((line) => line.amount > 0);
  if (!lines.length) {
    return null;
  }

  const outCents = Math.round(Number(input.outSum) * 100);
  const cents = lines.map((line) => Math.round(line.amount * 100));
  const drift = outCents - cents.reduce((total, value) => total + value, 0);
  cents[cents.length - 1] += drift;

  return {
    sno: input.sno,
    items: lines.map((line, index) => ({
      name: line.name.slice(0, 128),
      quantity: line.quantity,
      sum: cents[index] / 100,
      payment_method: ROBOKASSA_RECEIPT_PAYMENT_METHOD,
      payment_object: line.kind === "shipping" ? "service" : "commodity",
      tax: input.tax,
    })),
  };
};

/**
 * `Receipt`, URL-encoded once so the exact same bytes go into the signature
 * and the query string (fiscalization doc: "перед добавлением в подпись
 * значение параметра Receipt должно быть закодировано функцией url-encode").
 */
export const encodeRobokassaReceipt = (receipt: RobokassaReceipt): string =>
  encodeURIComponent(JSON.stringify(receipt));
