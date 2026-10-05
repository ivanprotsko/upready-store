import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type {
  X402PaymentPayload,
  X402PaymentRequired,
  X402PaymentRequirements,
  X402SettleResponse,
} from "./protocol";
import { encodeX402Header } from "./protocol";

export const X402_PROVIDER_ID = "pp_x402_x402";

/** A refund the owner still has to send from their own wallet: x402 has no way back by itself. */
export type X402Refund = {
  /** Atomic USDC. */
  amount: string;
  to: string | null;
  network: string | null;
  created_at: string;
};

/**
 * `payment_session.data` of an x402 payment (t-2026-10-03-33), copied onto
 * the payment when the order is placed, which is how the panel shows the
 * transaction at the order.
 *
 * `payment_required` is what the shop asked for when the session opened; the
 * buyer signs one of its `accepts`. `payment_payload` is the signed
 * authorization, absent until the buyer signs. Everything from `payer` down is
 * written by the backend after the facilitator answered, never by a client.
 */
export type X402SessionData = {
  provider: "x402";
  tenant_id: string;
  session_id: string;
  currency_code: "usd";
  /** Atomic USDC, the cart's total. */
  amount: string;
  payment_required: X402PaymentRequired;
  payment_payload: X402PaymentPayload | null;
  /** Lower-case, so the replay lookup compares one form. */
  payer: string | null;
  nonce: string | null;
  network: string | null;
  testnet: boolean | null;
  verified_at: string | null;
  settled_at: string | null;
  transaction: string | null;
  explorer_url: string | null;
  last_error: string | null;
  refunds: X402Refund[];
};

/** The requirement the signed payload answers, among those the session asked for. */
export const acceptedRequirementOf = (data: Partial<X402SessionData>): X402PaymentRequirements | null =>
  data.payment_payload?.accepted ?? null;

/** What `PAYMENT-RESPONSE` carries for a settled session. `null` until it is settled. */
export const settleResponseOf = (data: Partial<X402SessionData>): X402SettleResponse | null =>
  data.settled_at && data.transaction
    ? {
        success: true,
        transaction: data.transaction,
        network: data.network ?? "",
        ...(data.payer ? { payer: data.payer } : {}),
      }
    : null;

export const paymentResponseHeaderOf = (data: Partial<X402SessionData>): string | null => {
  const settled = settleResponseOf(data);
  return settled ? encodeX402Header(settled) : null;
};

export type X402SessionRow = {
  id: string;
  payment_collection_id: string;
  status: string;
  data: X402SessionData;
};

/**
 * Every x402 session that carries the authorization of (`payer`, `nonce`).
 * EIP-3009 lets one nonce move money once per payer, so this is the whole
 * history of one payment: the session it opened, and the one it settled in.
 * Read on the shared connection, outside any workflow's transaction, so a
 * replay sees a settlement the moment it is written. Deleted sessions count
 * too: a settlement is history whatever happened to its session later.
 *
 * A scan over the x402 sessions with a JSON filter, unindexed: x402 is new
 * and its sessions are few. A shop with a long history of them wants an
 * expression index on `(data->>'payer', data->>'nonce')`.
 */
export const findX402SessionsByAuthorization = async (
  pg: Knex,
  payer: string,
  nonce: string,
): Promise<X402SessionRow[]> => {
  const rows = (await pg("payment_session")
    .select("id", "payment_collection_id", "status", "data")
    .where({ provider_id: X402_PROVIDER_ID })
    .whereRaw("lower(data->>'payer') = ?", [payer.toLowerCase()])
    .whereRaw("lower(data->>'nonce') = ?", [nonce.toLowerCase()])
    .orderBy("created_at", "desc")) as X402SessionRow[];
  return rows;
};

/** The session among them that settled, if any. */
export const settledX402Session = (rows: readonly X402SessionRow[]): X402SessionRow | null =>
  rows.find((row) => Boolean(row.data?.settled_at && row.data?.transaction)) ?? null;

/**
 * The x402 session of a payment collection that already settled, if any. A
 * cart in that state must be completed as it is: opening another session
 * would delete this one, and with it the record of the money already sent.
 */
export const settledX402SessionOfCollection = async (
  pg: Knex,
  paymentCollectionId: string,
): Promise<X402SessionRow | null> => {
  const row = (await pg("payment_session")
    .select("id", "payment_collection_id", "status", "data")
    .where({ provider_id: X402_PROVIDER_ID, payment_collection_id: paymentCollectionId })
    .whereNull("deleted_at")
    .whereRaw("coalesce(data->>'settled_at', '') <> ''")
    .first()) as X402SessionRow | undefined;
  return row ?? null;
};
