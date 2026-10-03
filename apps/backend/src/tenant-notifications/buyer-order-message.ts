import { getEmailTranslator } from "../emails/i18n";
import { toNumber, type NumericValue } from "../emails/lib/big-number";
import { buyerText, type BuyerLocale } from "./buyer-messages";

/**
 * The buyer's own Telegram message about one order
 * (t-cherk-33-buyer-telegram-notifications). A pure function, like
 * `order-message.ts`'s `formatOrderMessage` for the owner: everything it
 * needs arrives as data, so its output is asserted in a unit test without a
 * database or a network.
 *
 * What it carries is the brief's own ask and nothing more: the order number,
 * the sum, and a link to the order page. The owner's message is a full recap
 * with items and an address; the buyer already knows what they bought, so
 * their ping stays short.
 */

export type BuyerOrderKind = "order-placed" | "payment-captured" | "shipment-created";

const TITLE_KEY: Record<BuyerOrderKind, "placedTitle" | "paidTitle" | "shippedTitle"> = {
  "order-placed": "placedTitle",
  "payment-captured": "paidTitle",
  "shipment-created": "shippedTitle",
};

export type BuyerOrderMessageOrder = {
  id: string;
  display_id?: number | string | null;
  currency_code?: string | null;
  total?: NumericValue | null;
};

export type FormatBuyerOrderMessageInput = {
  kind: BuyerOrderKind;
  order: BuyerOrderMessageOrder;
  locale: BuyerLocale;
  /** The buyer-facing order page of the order's own shop, never the engine's. */
  orderUrl: string;
};

export const formatBuyerOrderMessage = ({
  kind,
  order,
  locale,
  orderUrl,
}: FormatBuyerOrderMessageInput): string => {
  const { money } = getEmailTranslator(locale);
  const id = order.display_id ?? order.id;

  const lines: string[] = [buyerText(locale, TITLE_KEY[kind], { id: String(id) })];

  if (order.total !== undefined && order.total !== null) {
    lines.push(`${buyerText(locale, "total")}: ${money(toNumber(order.total), order.currency_code)}`);
  }

  lines.push("");
  lines.push(`${buyerText(locale, "openOrder")}: ${orderUrl}`);

  return lines.join("\n");
};
