import {
  buildRobokassaReceipt,
  encodeRobokassaReceipt,
  formatOutSum,
  invoiceIdFor,
  passwordFor,
  robokassaSignature,
  ROBOKASSA_PAYMENT_URL,
  type ResolvedRobokassaSecret,
  type RobokassaReceipt,
  type RobokassaReceiptLineInput,
} from "../../tenant-secrets/robokassa";
import { isSyntheticTelegramEmail } from "../auth-telegram/lib/identity";
import { sanitizeRobokassaAliases } from "./payment-methods";

/**
 * What the provider keeps on `payment_session.data`. Everything here is safe to
 * hand to the storefront (`/store/carts/:id?fields=payment_collection.payment_sessions.data`
 * returns it to the browser): the payment URL carries a signature, not a
 * password, and the credentials themselves never leave `initiatePayment`.
 *
 * `tenant_id` is written by the server (`src/api/middlewares.ts` overwrites
 * whatever the client sent before the provider runs), `result_*` only by
 * the Result webhook route and `return_*` only by the return check
 * (`src/api/store/tenant/robokassa-return`) through `updatePayment`, never
 * from the storefront:
 * `initiatePayment` builds this object from scratch, so a client-supplied
 * `result_confirmed_at` is dropped on the floor.
 *
 * `receipt_lines`/`receipt` are t-cherk-30: the first is what
 * `src/api/store/tenant/robokassa.ts` read off the cart (server-set, same
 * trust level as `tenant_id`), the second is the `Receipt` they were turned
 * into, `null` while the shop has fiscalization off. Both ride along on the
 * session so a rebuild (`buildRobokassaSession` called again from
 * `updatePayment`) does not need the cart a second time.
 *
 * `payment_methods`/`payment_fields` are t-2026-10-04-49, the checkout's own
 * method rows and Robokassa's modal over the checkout. `payment_methods` is
 * the server's whitelist of `IncCurrLabel` aliases for this shop
 * (`payment-methods.ts`, read from Robokassa's `GetCurrencies`); the storefront
 * opens Robokassa on an alias only when it is on this list. `payment_fields`
 * are the very parameters of `payment_url`, signature included, as the form
 * fields `Robokassa.Render` posts to its iframe. Neither `IncCurrLabel` nor
 * `Settings.PaymentMethods` enters the signature (pay-interface doc, «Сборка
 * подписи»: the modifiers are `Receipt`, `StepByStep`, `ResultUrl2`, the
 * `SuccessUrl2`/`FailUrl2` pairs and `Token`), so picking another method on
 * the checkout needs no new session, and with it no new `InvId`: a buyer who
 * scanned the SBP code and then switches to the card can still finish the SBP
 * payment into a session that exists.
 */
export type RobokassaSessionData = {
  provider: "robokassa";
  tenant_id: string;
  session_id: string;
  invoice_id: string;
  out_sum: string;
  currency_code: string;
  is_test: boolean;
  merchant_login: string;
  payment_url: string;
  success_url: string | null;
  fail_url: string | null;
  /** ISO time the signed Result webhook was accepted; `null` until then. */
  result_confirmed_at: string | null;
  /** `OutSum` verbatim from the accepted Result webhook. */
  result_out_sum: string | null;
  /**
   * t-2026-10-12-13: ISO time the buyer's return proved the payment (the
   * return's password #1 signature, or `OpStateExt` state 100), `null` until
   * then. The session then authorizes; the Result still captures.
   */
  return_confirmed_at: string | null;
  return_confirmed_by: "success_signature" | "op_state" | null;
  /** The session's `OutSum` the return confirmed. */
  return_out_sum: string | null;
  /**
   * t-2026-10-12-13: ISO time the buyer came back through the success address
   * with nothing proven either way. The session then answers
   * `pending_authorization`: the cart becomes an order without a payment, and
   * the Result webhook pays it.
   */
  return_seen_at: string | null;
  receipt_lines: RobokassaReceiptLineInput[];
  receipt: RobokassaReceipt | null;
  /** The `IncCurrLabel` aliases this shop may be opened on, best first. */
  payment_methods: string[];
  /** `payment_url`'s own parameters as form fields, `Receipt` URL-encoded exactly as it was signed. */
  payment_fields: Record<string, string>;
};

export type BuildRobokassaSessionInput = {
  secret: ResolvedRobokassaSecret;
  sessionId: string;
  amount: number | string;
  currencyCode: string;
  successUrl: string | null;
  failUrl: string | null;
  email: string | null;
  culture: string | null;
  description: string | null;
  /** Cart lines for the `Receipt` (t-cherk-30); ignored unless the shop's fiscalization switch is on. */
  receiptLines: RobokassaReceiptLineInput[];
  /** The shop's `IncCurrLabel` aliases (t-2026-10-04-49); anything not shaped like one is dropped. */
  paymentMethods: string[];
};

/**
 * Robokassa's payment URL with the signature
 * `MerchantLogin:OutSum:InvId:[Receipt:][SuccessUrl2:SuccessUrl2Method:][FailUrl2:FailUrl2Method:]Password#1:Shp_SessionID=<id>`
 * — the order `@gorgo/medusa-payment-robokassa` 1.0.0 used for everything but
 * `Receipt` (read from the old project's installed copy, measured there
 * against Robokassa's test page), with `Receipt` inserted right after `InvId`
 * at the position the fiscalization doc's own formula gives it
 * (docs.robokassa.ru/ru/pay-interface, modifier order).
 *
 * `Receipt`, when present, is URL-encoded ONCE and that same encoded string is
 * used both in the signature and in the query string — never re-encoded a
 * second time through `URLSearchParams`, which would change the bytes the
 * signature was computed over.
 */
export const buildRobokassaSession = (input: BuildRobokassaSessionInput): RobokassaSessionData => {
  const { secret, sessionId } = input;
  const outSum = formatOutSum(input.amount);
  const invoiceId = invoiceIdFor(sessionId);
  const urlParams = {
    SuccessUrl2: input.successUrl,
    SuccessUrl2Method: input.successUrl ? "GET" : null,
    FailUrl2: input.failUrl,
    FailUrl2Method: input.failUrl ? "GET" : null,
  };

  const receipt = secret.credentials.fiscalization_enabled
    ? buildRobokassaReceipt({
        lines: input.receiptLines,
        outSum,
        sno: secret.credentials.sno,
        tax: secret.credentials.default_tax,
      })
    : null;
  const receiptEncoded = receipt ? encodeRobokassaReceipt(receipt) : null;

  const signature = robokassaSignature(
    [
      secret.credentials.merchant_login,
      outSum,
      invoiceId,
      receiptEncoded,
      urlParams.SuccessUrl2,
      urlParams.SuccessUrl2Method,
      urlParams.FailUrl2,
      urlParams.FailUrl2Method,
      passwordFor(secret, 1),
      `Shp_SessionID=${sessionId}`,
    ],
    secret.credentials.hash_algorithm,
  );

  // One ordered set of fields for both carriers: the query string of
  // `payment_url` (the full-page redirect) and the form `Robokassa.Render`
  // posts into its iframe (t-2026-10-04-49). `Receipt` goes last and is the
  // already-encoded string in both, the bytes the signature was computed over:
  // the doc's own form example posts it URL-encoded, and the iframe doc's demo
  // passes it «преобразованным через encodeURIComponent».
  const fields: Record<string, string> = {};
  fields.MerchantLogin = secret.credentials.merchant_login;
  fields.OutSum = outSum;
  fields.InvId = invoiceId;
  if (input.description) {
    fields.Description = input.description.slice(0, 100);
  }
  fields.SignatureValue = signature;
  fields.Shp_SessionID = sessionId;
  for (const [key, value] of Object.entries(urlParams)) {
    if (value) {
      fields[key] = value;
    }
  }
  // Robokassa mails the receipt to this address; a Telegram buyer's synthetic one would bounce.
  if (input.email && !isSyntheticTelegramEmail(input.email)) {
    fields.Email = input.email;
  }
  if (input.culture) {
    fields.Culture = input.culture;
  }
  if (secret.is_test) {
    fields.IsTest = "1";
  }

  const query = new URLSearchParams(fields).toString() + (receiptEncoded ? `&Receipt=${receiptEncoded}` : "");
  if (receiptEncoded) {
    fields.Receipt = receiptEncoded;
  }

  return {
    provider: "robokassa",
    tenant_id: secret.tenant_id,
    session_id: sessionId,
    invoice_id: invoiceId,
    out_sum: outSum,
    currency_code: input.currencyCode,
    is_test: secret.is_test,
    merchant_login: secret.credentials.merchant_login,
    payment_url: `${ROBOKASSA_PAYMENT_URL}?${query}`,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    result_confirmed_at: null,
    result_out_sum: null,
    return_confirmed_at: null,
    return_confirmed_by: null,
    return_out_sum: null,
    return_seen_at: null,
    receipt_lines: input.receiptLines,
    receipt,
    payment_methods: sanitizeRobokassaAliases(input.paymentMethods),
    payment_fields: fields,
  };
};
