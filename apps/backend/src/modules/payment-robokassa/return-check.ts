import {
  passwordFor,
  sameOutSum,
  secretInSessionMode,
  verifySuccessSignature,
  type ResolvedRobokassaSecret,
} from "../../tenant-secrets/robokassa";
import type { RobokassaSessionData } from "./build-session";
import { robokassaOpStateVerdict, type RobokassaOpState } from "./op-state";

/**
 * What the buyer's return from Robokassa proves (t-2026-10-12-13, Ivan 12.10:
 * «если заказ прошел успешно, то нужно перенаправлять на страницу успешного
 * заказа а не корзину»). One decision, taken server-side at the moment the
 * browser comes back through `SuccessUrl2`, before the cart is completed:
 *
 * 1. The return's own signature. Robokassa signs the full-page return with
 *    password #1 (`OutSum:InvId:Password#1:Shp_SessionID=<id>`) and sends it
 *    only after a successful payment. Valid, for this session, this invoice
 *    and this sum → `confirmed`.
 * 2. Else `OpStateExt`, asked with password #2, for a live invoice only (the
 *    docs: it does not see test payments). State 100 with the invoiced sum →
 *    `confirmed`; an invoice Robokassa does not know, cancelled or refused →
 *    `not_paid`.
 * 3. Else `pending`: the buyer came back through the success address and
 *    nothing could prove or disprove it within the one check. The order is
 *    placed without a payment (`pending_authorization`), and the Result
 *    webhook pays it.
 *
 * Measured on the test shop 12.10.2026: the full-page return carries the
 * signature; the modal's success (`Robokassa.Render`) reports only
 * `{ action: "paymentSuccess", params: null }`, so a modal payment is
 * confirmed by `OpStateExt` in live mode and is `pending` in test mode until
 * the Result arrives.
 *
 * Every check the Result webhook makes on a signature is made here too: the
 * pair of the mode the session was created in, and a test invoice never
 * confirms a shop that is live now.
 */

export type RobokassaReturnParams = {
  OutSum?: string;
  InvId?: string;
  SignatureValue?: string;
  Shp_SessionID?: string;
};

export type RobokassaReturnDecision =
  | { kind: "confirmed"; by: "success_signature" | "op_state"; outSum: string }
  | { kind: "pending"; reason: string }
  | { kind: "not_paid"; reason: string };

export type CheckRobokassaReturnInput = {
  data: Partial<RobokassaSessionData>;
  params: RobokassaReturnParams;
  /** The shop's row as stored now; the mode of the session is applied here. */
  shopSecret: ResolvedRobokassaSecret;
  /** Asks `OpStateExt` with the given password #2; `null` when Robokassa could not be asked. */
  askOpState: (input: { merchantLogin: string; invoiceId: string; password2: string }) => Promise<RobokassaOpState | null>;
};

/** Whether the return's signature confirms THIS session's invoice. */
export const returnSignatureConfirms = (
  data: Partial<RobokassaSessionData>,
  params: RobokassaReturnParams,
  shopSecret: ResolvedRobokassaSecret,
): boolean => {
  if (!params.OutSum || !params.InvId || !params.SignatureValue || !params.Shp_SessionID) {
    return false;
  }
  if (params.Shp_SessionID !== data.session_id || params.InvId !== data.invoice_id) {
    return false;
  }
  if (!sameOutSum(params.OutSum, data.out_sum)) {
    return false;
  }
  const secret = secretInSessionMode(shopSecret, data.is_test);
  if (secret.is_test && !shopSecret.is_test) {
    return false;
  }
  return verifySuccessSignature(params, secret);
};

export const checkRobokassaReturn = async (input: CheckRobokassaReturnInput): Promise<RobokassaReturnDecision> => {
  const { data, params, shopSecret } = input;
  if (!data.invoice_id || !data.out_sum) {
    return { kind: "pending", reason: "session_without_invoice" };
  }

  if (returnSignatureConfirms(data, params, shopSecret)) {
    return { kind: "confirmed", by: "success_signature", outSum: data.out_sum };
  }

  const secret = secretInSessionMode(shopSecret, data.is_test);
  if (secret.is_test) {
    return { kind: "pending", reason: params.SignatureValue ? "signature_not_valid" : "test_invoice_without_signature" };
  }

  const state = await input.askOpState({
    merchantLogin: data.merchant_login || secret.credentials.merchant_login,
    invoiceId: data.invoice_id,
    password2: passwordFor(secret, 2),
  });
  const verdict = robokassaOpStateVerdict(state, data.out_sum);
  if (verdict === "paid") {
    return { kind: "confirmed", by: "op_state", outSum: data.out_sum };
  }
  if (verdict === "not_paid") {
    return { kind: "not_paid", reason: `op_state_${state?.resultCode === 3 ? "not_found" : `state_${state?.stateCode}`}` };
  }
  return {
    kind: "pending",
    reason: state ? `op_state_${state.resultCode === 0 ? `state_${state.stateCode}` : `code_${state.resultCode}`}` : "op_state_unreachable",
  };
};
