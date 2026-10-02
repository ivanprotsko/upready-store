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

/**
 * What the provider keeps on `payment_session.data`. Everything here is safe to
 * hand to the storefront (`/store/carts/:id?fields=payment_collection.payment_sessions.data`
 * returns it to the browser): the payment URL carries a signature, not a
 * password, and the credentials themselves never leave `initiatePayment`.
 *
 * `tenant_id` is written by the server (`src/api/middlewares.ts` overwrites
 * whatever the client sent before the provider runs) and `result_*` only by
 * the Result webhook route through `updatePayment`, never from the storefront:
 * `initiatePayment` builds this object from scratch, so a client-supplied
 * `result_confirmed_at` is dropped on the floor.
 *
 * `receipt_lines`/`receipt` are t-cherk-30: the first is what
 * `src/api/store/tenant/robokassa.ts` read off the cart (server-set, same
 * trust level as `tenant_id`), the second is the `Receipt` they were turned
 * into, `null` while the shop has fiscalization off. Both ride along on the
 * session so a rebuild (`buildRobokassaSession` called again from
 * `updatePayment`) does not need the cart a second time.
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
  receipt_lines: RobokassaReceiptLineInput[];
  receipt: RobokassaReceipt | null;
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

  const params = new URLSearchParams();
  params.set("MerchantLogin", secret.credentials.merchant_login);
  params.set("OutSum", outSum);
  params.set("InvId", invoiceId);
  if (input.description) {
    params.set("Description", input.description.slice(0, 100));
  }
  params.set("SignatureValue", signature);
  params.set("Shp_SessionID", sessionId);
  for (const [key, value] of Object.entries(urlParams)) {
    if (value) {
      params.set(key, value);
    }
  }
  if (input.email) {
    params.set("Email", input.email);
  }
  if (input.culture) {
    params.set("Culture", input.culture);
  }
  if (secret.is_test) {
    params.set("IsTest", "1");
  }

  const query = params.toString() + (receiptEncoded ? `&Receipt=${receiptEncoded}` : "");

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
    receipt_lines: input.receiptLines,
    receipt,
  };
};
