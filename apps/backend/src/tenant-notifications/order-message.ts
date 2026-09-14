import { getEmailTranslator } from "../emails/i18n";
import { toNumber, type NumericValue } from "../emails/lib/big-number";
import { ownerText, type OwnerLocale } from "./owner-messages";

/**
 * The owner's message about one order (t08-order-notifications). A pure
 * function: everything it needs arrives as data, so its output is asserted in
 * `__tests__/order-message.unit.spec.ts` without a database or a network.
 *
 * What it must carry was decided by the shop owner's own ask: the shop, the
 * order number, the total, the line items with quantities, the customer's name
 * and phone, how and where it ships, and a link that opens the order in the
 * panel.
 */

export type OwnerOrderAddress = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  company?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country_code?: string | null;
};

export type OwnerOrder = {
  id: string;
  display_id?: number | string | null;
  email?: string | null;
  currency_code?: string | null;
  total?: NumericValue;
  shipping_total?: NumericValue;
  items?: Array<{
    title?: string | null;
    variant_title?: string | null;
    quantity?: NumericValue;
    unit_price?: NumericValue;
    total?: NumericValue;
  }> | null;
  shipping_methods?: Array<{ name?: string | null; amount?: NumericValue }> | null;
  shipping_address?: OwnerOrderAddress | null;
  billing_address?: OwnerOrderAddress | null;
  customer?: { phone?: string | null; email?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

const fullName = (address?: OwnerOrderAddress | null): string =>
  [address?.first_name, address?.last_name].filter(Boolean).join(" ").trim();

/** Street level first, then the settlement: how a courier reads an address out loud. */
const addressLine = (address?: OwnerOrderAddress | null): string =>
  [
    address?.postal_code,
    address?.country_code ? address.country_code.toUpperCase() : null,
    address?.province,
    address?.city,
    address?.address_1,
    address?.address_2,
    address?.company,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ");

const orderComment = (order: OwnerOrder): string => {
  const raw = order.metadata?.comment ?? order.metadata?.note;
  return typeof raw === "string" ? raw.trim() : "";
};

export type FormatOrderMessageInput = {
  order: OwnerOrder;
  shopName: string;
  locale: OwnerLocale;
  /** `null` when the deployment has no panel address configured. */
  panelUrl: string | null;
};

export const formatOrderMessage = ({
  order,
  shopName,
  locale,
  panelUrl,
}: FormatOrderMessageInput): string => {
  const { money } = getEmailTranslator(locale);
  const amount = (value: NumericValue) => money(toNumber(value), order.currency_code);
  const label = (key: Parameters<typeof ownerText>[1], values?: Record<string, string | number>) =>
    ownerText(locale, key, values);

  const id = order.display_id ?? order.id;
  const lines: string[] = [label("newOrder", { id: String(id) })];

  lines.push(`${label("shop")}: ${shopName}`);
  lines.push("");

  const items = order.items ?? [];
  if (items.length) {
    lines.push(`${label("items")}:`);
    for (const item of items) {
      const title = [item.title, item.variant_title].filter(Boolean).join(" / ") || "—";
      const quantity = toNumber(item.quantity ?? 1);
      const lineTotal =
        item.total !== undefined && item.total !== null
          ? item.total
          : toNumber(item.unit_price ?? 0) * quantity;
      lines.push(`• ${title} — ${quantity} ${label("quantityShort")} — ${amount(lineTotal)}`);
    }
    lines.push("");
  }

  const method = order.shipping_methods?.[0];
  if (method?.name) {
    lines.push(`${label("delivery")}: ${method.name}`);
  }
  if (order.shipping_total !== undefined && order.shipping_total !== null) {
    lines.push(`${label("shipping")}: ${amount(order.shipping_total)}`);
  }
  if (order.total !== undefined && order.total !== null) {
    lines.push(`${label("total")}: ${amount(order.total)}`);
  }
  lines.push("");

  const address = order.shipping_address ?? order.billing_address ?? null;
  const name = fullName(address);
  if (name) {
    lines.push(`${label("customer")}: ${name}`);
  }

  const phone = address?.phone || order.billing_address?.phone || order.customer?.phone;
  if (phone) {
    lines.push(`${label("phone")}: ${phone}`);
  }

  const email = order.email || order.customer?.email;
  if (email) {
    lines.push(`${label("email")}: ${email}`);
  }

  const where = addressLine(address);
  if (where) {
    lines.push(`${label("address")}: ${where}`);
  }

  const comment = orderComment(order);
  if (comment) {
    lines.push(`${label("comment")}: ${comment}`);
  }

  if (panelUrl) {
    lines.push("");
    lines.push(`${label("openInPanel")}: ${panelUrl}`);
  }

  // A trailing blank line from an empty section is noise in a chat window.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};
