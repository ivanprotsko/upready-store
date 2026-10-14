/**
 * The `POST /orders` body for one Medusa fulfillment (t-2026-10-14-58):
 * the sender from the shop's slot, the recipient from the order's address,
 * the places and items from the fulfillment's lines, the money from the order.
 *
 * Pure: no network, no database. What Medusa 2.19 hands `createFulfillment`
 * is what `cdek/package-items.ts` documents: the fulfillment `items` carry
 * `line_item_id`, `quantity`, `sku` and the variant's title, with no price and
 * no weight; the `order` carries every line with `unit_price`, the variant's
 * `weight`, and the variant's inventory items. Each parcel line is read off
 * the order's line by `line_item_id`. A unit weighs what the price weighed it
 * at: the variant, then its product (added by the provider,
 * `cdek/product-weights.ts`), then the shop's default (`unitWeightGrams`).
 *
 * Units, as ApiShip wants them: weight in grams, sides in centimetres, money
 * in roubles. Amounts in Medusa 2 are already in the currency's main unit.
 */

import { unitWeightGrams } from "../cdek/method";
import { amountOf } from "../cdek/package-items";
import type { ApishipCredentials } from "../tenant-secrets/apiship";
import { deliveryTypeFor, pickupTypeFor, type ApishipShippingMethodData } from "./method";
import type { ApishipAddress, ApishipItem, ApishipOrderRequest, ApishipPlace } from "./orders";

/** Grams for one unit whose variant has no weight, when the shop set none either. */
export const FALLBACK_UNIT_WEIGHT_G = 500;
/** Longest `description` sent: the carrier prints it on the label. */
export const ITEM_NAME_MAX = 255;
/** Longest `articul`. */
export const ARTICUL_MAX = 50;

type Line = {
  id?: string;
  title?: string | null;
  product_title?: string | null;
  variant_title?: string | null;
  variant_sku?: string | null;
  variant_id?: string | null;
  unit_price?: unknown;
  variant?: {
    sku?: string | null;
    weight?: number | null;
    /** Not in Medusa's order: `withProductWeights` puts it here for a variant without a weight. */
    product?: { weight?: number | null } | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    inventory_items?: Array<{
      required_quantity?: number | null;
      inventory?: { id?: string | null } | null;
    }> | null;
  } | null;
};

type FulfilledItem = {
  line_item_id?: string | null;
  inventory_item_id?: string | null;
  quantity?: unknown;
  title?: string | null;
  sku?: string | null;
};

type OrderAddress = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

const clean = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();

/**
 * ApiShip takes `phone` up to 15 characters and its examples are digits only
 * (`79250001115`). A Russian number typed as `8 (925) 000-11-15` or
 * `+7 925 …` becomes `79250001115`; anything else keeps its digits.
 */
export const apishipPhone = (raw: string | null | undefined): string => {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10 && /^9/.test(digits)) return `7${digits}`;
  return digits.slice(0, 15);
};

/** «Product, variant»; a variant called like the product or Medusa's «Default variant» adds nothing. */
const nameOf = (line: Line | undefined, item: FulfilledItem): string => {
  const product = clean(line?.product_title) || clean(line?.title) || clean(item.title);
  const variant = clean(line?.variant_title);
  const useless = !variant || variant.toLowerCase() === product.toLowerCase() || /^default( variant)?$/i.test(variant);
  const name = useless ? product : `${product}, ${variant}`;
  return (name || "Товар").slice(0, ITEM_NAME_MAX);
};

export type ApishipParcel = {
  items: ApishipItem[];
  /** Grams, the sum of the items. */
  weight: number;
  /** Roubles, the sum of the items' declared value. */
  assessed_cost: number;
};

/**
 * One item per order line in the fulfillment. `defaultWeightG` is the shop's
 * default for a unit with no weight on its variant or product (the method's
 * `default_weight_g`, the number the price was quoted with); without it
 * {@link FALLBACK_UNIT_WEIGHT_G}.
 * Nothing is collected on delivery: the order was paid on the site, so every
 * `cost` is 0 and the unit price goes into `assessedCost` (the declared value).
 */
export const apishipParcel = (
  fulfilled: ReadonlyArray<Record<string, unknown>>,
  order: Record<string, unknown> | undefined,
  defaultWeightG?: number | null,
): ApishipParcel => {
  const lines = new Map<string, Line>();
  for (const line of (order?.items ?? []) as Line[]) {
    if (line?.id) lines.set(line.id, line);
  }
  const unitDefault =
    typeof defaultWeightG === "number" && defaultWeightG > 0 ? Math.round(defaultWeightG) : FALLBACK_UNIT_WEIGHT_G;

  // A variant with managed inventory comes as one fulfillment item per
  // inventory item: the first one of each line, divided back by its
  // `required_quantity`, is how many of the line go into this parcel.
  const seen = new Set<string>();
  const items: ApishipItem[] = [];
  for (const raw of fulfilled as FulfilledItem[]) {
    const key = raw.line_item_id ?? `${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = raw.line_item_id ? lines.get(raw.line_item_id) : undefined;
    const required =
      line?.variant?.inventory_items?.find((each) => each?.inventory?.id && each.inventory.id === raw.inventory_item_id)
        ?.required_quantity ?? 1;
    const quantity = Math.max(1, Math.round(amountOf(raw.quantity) / (Number(required) > 0 ? Number(required) : 1)));
    const weight = Math.max(
      1,
      Math.round(
        unitWeightGrams({ weight: line?.variant?.weight, product_weight: line?.variant?.product?.weight }, unitDefault),
      ),
    );
    const articul = clean(line?.variant_sku) || clean(line?.variant?.sku) || clean(raw.sku) || clean(line?.variant_id) || key;
    const unitPrice = Math.max(0, Math.round(amountOf(line?.unit_price) * 100) / 100);
    const dims = line?.variant;
    items.push({
      description: nameOf(line, raw),
      quantity,
      articul: articul.slice(0, ARTICUL_MAX),
      assessedCost: unitPrice,
      cost: 0,
      weight,
      ...(typeof dims?.length === "number" && dims.length > 0 ? { length: Math.round(dims.length) } : {}),
      ...(typeof dims?.width === "number" && dims.width > 0 ? { width: Math.round(dims.width) } : {}),
      ...(typeof dims?.height === "number" && dims.height > 0 ? { height: Math.round(dims.height) } : {}),
    });
  }
  const weight = items.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const assessed = items.reduce((sum, item) => sum + (item.assessedCost ?? 0) * item.quantity, 0);
  return { items, weight: Math.max(1, weight), assessed_cost: Math.round(assessed * 100) / 100 };
};

/** The sender block from the shop's slot. `null` when a required field is missing, with its name. */
export const apishipSender = (
  credentials: ApishipCredentials,
): { sender: ApishipAddress } | { missing: string } => {
  const contactName = clean(credentials.sender_name);
  const phone = apishipPhone(credentials.sender_phone);
  const addressString = clean(credentials.sender_address);
  if (!contactName) return { missing: "sender_name" };
  if (!phone) return { missing: "sender_phone" };
  if (!addressString) return { missing: "sender_address" };
  return {
    sender: {
      countryCode: (credentials.sender_country_code || "RU").toUpperCase(),
      contactName,
      phone,
      addressString,
      ...(credentials.sender_company ? { companyName: clean(credentials.sender_company), brandName: clean(credentials.sender_company) } : {}),
      ...(credentials.sender_email ? { email: clean(credentials.sender_email) } : {}),
      ...(credentials.sender_region ? { region: clean(credentials.sender_region) } : {}),
      ...(credentials.sender_city ? { city: clean(credentials.sender_city) } : {}),
      ...(credentials.sender_index ? { postIndex: clean(credentials.sender_index) } : {}),
    },
  };
};

/**
 * The recipient block from the order's shipping address. For a delivery to a
 * point the address is the point's, so the carrier's label names where the
 * parcel waits; the buyer's own phone and name stay, they are who collects it.
 */
export const apishipRecipient = (
  address: OrderAddress,
  email: string | null | undefined,
  point: { address: string | null; city: string | null; region: string | null; postIndex: string | null } | null,
): { recipient: ApishipAddress } | { missing: string } => {
  const contactName = clean([address.first_name, address.last_name].filter(Boolean).join(" ")) || "Получатель";
  const phone = apishipPhone(address.phone);
  if (!phone) return { missing: "recipient_phone" };

  const country = (address.country_code || "ru").toUpperCase();
  const buyerLine = [address.postal_code, address.province, address.city, address.address_1, address.address_2]
    .map(clean)
    .filter(Boolean)
    .join(", ");
  const addressString = point ? clean(point.address) || buyerLine : buyerLine;
  if (!addressString) return { missing: "recipient_address" };

  return {
    recipient: {
      countryCode: country,
      contactName: contactName.slice(0, 255),
      phone,
      addressString: addressString.slice(0, 255),
      ...(email ? { email: clean(email).slice(0, 50) } : {}),
      ...(point
        ? {
            ...(point.region ? { region: point.region } : {}),
            ...(point.city ? { city: point.city } : {}),
            ...(point.postIndex ? { postIndex: point.postIndex } : {}),
          }
        : {
            ...(address.province ? { region: clean(address.province) } : {}),
            ...(address.city ? { city: clean(address.city) } : {}),
            ...(address.postal_code ? { postIndex: clean(address.postal_code) } : {}),
          }),
    },
  };
};

export type BuildOrderRequestInput = {
  methodData: ApishipShippingMethodData;
  credentials: ApishipCredentials;
  tariffId: number;
  clientNumber: string;
  order: Record<string, unknown> | undefined;
  items: ReadonlyArray<Record<string, unknown>>;
  point: { address: string | null; city: string | null; region: string | null; postIndex: string | null } | null;
  /** The cabinet's connection to use when it has several for one carrier. */
  connectionId?: string | null;
};

/**
 * The whole request, or the name of the field that stops it. The amount the
 * buyer paid for delivery goes into `cost.deliveryCost` as information for
 * the carrier's label; nothing is collected (`codCost: 0`).
 */
export const buildApishipOrderRequest = (
  input: BuildOrderRequestInput,
): { request: ApishipOrderRequest; parcel: ApishipParcel } | { missing: string } => {
  const { methodData, credentials } = input;
  const sender = apishipSender(credentials);
  if ("missing" in sender) return sender;

  const address = ((input.order?.shipping_address ?? {}) as OrderAddress) ?? {};
  const recipient = apishipRecipient(address, input.order?.email as string | undefined, input.point);
  if ("missing" in recipient) return recipient;

  const parcel = apishipParcel(input.items, input.order, methodData.default_weight_g);
  const size = {
    length: credentials.default_length_cm,
    width: credentials.default_width_cm,
    height: credentials.default_height_cm,
  };
  const place: ApishipPlace = {
    placeNumber: "1",
    weight: parcel.weight,
    ...size,
    items: parcel.items,
  };
  const displayId = clean(String(input.order?.display_id ?? ""));

  const request: ApishipOrderRequest = {
    order: {
      clientNumber: input.clientNumber,
      providerKey: methodData.provider_key,
      ...(input.connectionId ? { providerConnectId: String(input.connectionId) } : {}),
      pickupType: pickupTypeFor(credentials.sender_mode),
      deliveryType: deliveryTypeFor(methodData.kind),
      tariffId: input.tariffId,
      ...(credentials.sender_mode === "point" && credentials.sender_point_id ? { pointInId: credentials.sender_point_id } : {}),
      ...(methodData.kind === "pickup" && methodData.apiship_point_id ? { pointOutId: methodData.apiship_point_id } : {}),
      weight: parcel.weight,
      ...size,
      description: displayId ? `Заказ ${displayId}` : undefined,
    },
    cost: {
      assessedCost: parcel.assessed_cost,
      codCost: 0,
      deliveryCost: Math.max(0, Number(methodData.carrier_amount ?? 0) || 0),
      isDeliveryPayedByRecipient: false,
    },
    sender: sender.sender,
    recipient: recipient.recipient,
    places: [place],
  };
  return { request, parcel };
};
