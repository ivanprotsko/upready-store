import { robokassaSignature, sameOutSum, type RobokassaHashAlgorithm } from "../../tenant-secrets/robokassa";

/**
 * Robokassa's invoice state, asked server to server (t-2026-10-12-13, D2).
 *
 * `OpStateExt` (docs.robokassa.ru/ru/xml-interfaces, read 12.10.2026) takes the
 * shop's `MerchantLogin`, the `InvoiceID` and `Signature`, a hex hash of
 * `MerchantLogin:InvoiceID:Password#2`, and answers `OperationStateResponse`:
 * `Result/Code` (0 success, 1 bad signature, 2 shop not found, 3 invoice not
 * found, 4 two operations under one number, 1000 internal error), `State/Code`
 * (5 initiated, 10 cancelled, 20 hold, 50 funds received and being credited,
 * 60 refused and returned, 80 suspended, 100 paid and notified) and `Info`
 * with `IncSum` (what the buyer paid, in `IncCurrLabel`) and `OutSum` (what
 * the shop is credited, in `OutCurrLabel`).
 *
 * The docs say it works «только в основном режиме»: a test invoice cannot be
 * asked, so a test session never calls it.
 *
 * Robokassa's Result webhook and this answer agree on «paid» only at state
 * 100, so that is the one state that confirms. The sum is checked against the
 * session's own `OutSum`, either `IncSum` or `OutSum` of the answer: a shop
 * that passes the fee on to the buyer is credited less than it invoiced.
 */

export const ROBOKASSA_OP_STATE_URL = "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";

export type RobokassaOpState = {
  /** `Result/Code`, `null` when the document carried none. */
  resultCode: number | null;
  /** `State/Code`, `null` without a `State` element (any `resultCode` but 0). */
  stateCode: number | null;
  incSum: string | null;
  outSum: string | null;
};

const element = (xml: string, path: string[]): string | null => {
  let scope = xml;
  for (const name of path) {
    const match = scope.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
    if (!match) {
      return null;
    }
    scope = match[1];
  }
  return scope.trim();
};

const integer = (value: string | null): number | null => {
  if (value === null || !/^-?\d+$/.test(value)) {
    return null;
  }
  return Number(value);
};

/** One `OperationStateResponse`, read without an XML dependency: the document is small and flat. */
export const parseRobokassaOpState = (xml: string): RobokassaOpState => ({
  resultCode: integer(element(xml, ["Result", "Code"])),
  stateCode: integer(element(xml, ["State", "Code"])),
  incSum: element(xml, ["Info", "IncSum"]) || null,
  outSum: element(xml, ["Info", "OutSum"]) || null,
});

/**
 * What the answer means for the session that invoiced `expectedOutSum`:
 * - `paid`: state 100 with the invoiced sum;
 * - `not_paid`: Robokassa does not know the invoice (code 3) or cancelled or
 *   refused it (states 10 and 60), so the buyer did not pay this one;
 * - `unknown`: anything else, a payment still on its way (5, 20, 50, 80), a
 *   sum that does not match, or an answer that is not an answer.
 */
export type RobokassaOpStateVerdict = "paid" | "not_paid" | "unknown";

export const robokassaOpStateVerdict = (
  state: RobokassaOpState | null,
  expectedOutSum: string,
): RobokassaOpStateVerdict => {
  if (!state) {
    return "unknown";
  }
  if (state.resultCode === 3) {
    return "not_paid";
  }
  if (state.resultCode !== 0) {
    return "unknown";
  }
  if (state.stateCode === 10 || state.stateCode === 60) {
    return "not_paid";
  }
  if (state.stateCode === 100 && (sameOutSum(state.incSum, expectedOutSum) || sameOutSum(state.outSum, expectedOutSum))) {
    return "paid";
  }
  return "unknown";
};

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type AskRobokassaOpStateInput = {
  merchantLogin: string;
  invoiceId: string;
  password2: string;
  algorithm: RobokassaHashAlgorithm;
  fetch?: FetchLike;
  /** The return waits for this answer; Robokassa usually answers in well under a second. */
  timeoutMs?: number;
  logger?: { warn: (message: string) => void };
};

const TIMEOUT_MS = 3_000;

/**
 * Asks Robokassa once. `null` when it could not be asked or did not answer
 * with a document: the caller treats that as «unknown», never as «not paid».
 */
export const askRobokassaOpState = async (input: AskRobokassaOpStateInput): Promise<RobokassaOpState | null> => {
  const fetchImpl: FetchLike = input.fetch ?? ((url, init) => fetch(url, init));
  const signature = robokassaSignature(
    [input.merchantLogin, input.invoiceId, input.password2],
    input.algorithm,
  );
  const query = new URLSearchParams({
    MerchantLogin: input.merchantLogin,
    InvoiceID: input.invoiceId,
    Signature: signature,
  });
  try {
    const response = await fetchImpl(`${ROBOKASSA_OP_STATE_URL}?${query.toString()}`, {
      signal: AbortSignal.timeout(input.timeoutMs ?? TIMEOUT_MS),
    });
    if (!response.ok) {
      input.logger?.warn(`[robokassa] OpStateExt for invoice ${input.invoiceId} answered HTTP ${response.status}`);
      return null;
    }
    return parseRobokassaOpState(await response.text());
  } catch (error) {
    input.logger?.warn(
      `[robokassa] OpStateExt for invoice ${input.invoiceId} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};
