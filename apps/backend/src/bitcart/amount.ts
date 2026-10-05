import { toBtcpayAmount } from "../btcpay/amount";

/**
 * Amounts between Medusa and Bitcart (ask-20261005-070255-438f, stage 2).
 *
 * The arithmetic is BTCPay's (`btcpay/amount.ts`): integer minor units at
 * every step, compared with `sameAmount`. Bitcart takes `price` as a Python
 * `Decimal`, which parses a decimal string exactly, and answers it as a plain
 * decimal string with the currency's own digits (`"25.50"`, no grouping).
 */
export { amountToNumber, sameAmount } from "../btcpay/amount";

/** Bitcart's `price` for `amount` in `currency`: `25.5` USD is `"25.50"`, `1000` JPY is `"1000"`. */
export const toBitcartPrice = (amount: unknown, currency: string): string => toBtcpayAmount(amount, currency);
