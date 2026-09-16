/**
 * What a CDEK shipping option carries in `shipping_option.data`, and how a CDEK
 * tariff list turns into one price and one term (i02-apiship-cdek-shipping).
 *
 * Pure functions only, so the fulfillment provider, the store routes and the
 * unit tests all agree on the same arithmetic. The provider is the only caller
 * that talks to the network.
 */

import type { CdekTariff } from "./client";

export const CDEK_METHOD_SCHEMA = "upready.cdek-method/v1" as const;

/** Where the parcel ends up. `pickup` covers a CDEK office, `postamat` a locker. */
export type CdekDeliveryKind = "courier" | "pickup" | "postamat";

/** Where the parcel starts: the shop hands it to a courier, or brings it to a CDEK office. */
export type CdekSenderMode = "door" | "warehouse";

/**
 * CDEK's `delivery_mode` enumerates the two halves of the route at once
 * (measured against the live tariff list on 2026-09-16, and named in the tariff
 * titles themselves: «Посылка склад-склад» comes back as mode 4).
 */
export const CDEK_DELIVERY_MODES = {
  DOOR_DOOR: 1,
  DOOR_WAREHOUSE: 2,
  WAREHOUSE_DOOR: 3,
  WAREHOUSE_WAREHOUSE: 4,
  DOOR_POSTAMAT: 6,
  WAREHOUSE_POSTAMAT: 7,
} as const;

/** The single `delivery_mode` a (sender mode, delivery kind) pair asks for. */
export const deliveryModeFor = (sender: CdekSenderMode, kind: CdekDeliveryKind): number => {
  if (sender === "door") {
    if (kind === "courier") return CDEK_DELIVERY_MODES.DOOR_DOOR;
    if (kind === "pickup") return CDEK_DELIVERY_MODES.DOOR_WAREHOUSE;
    return CDEK_DELIVERY_MODES.DOOR_POSTAMAT;
  }
  if (kind === "courier") return CDEK_DELIVERY_MODES.WAREHOUSE_DOOR;
  if (kind === "pickup") return CDEK_DELIVERY_MODES.WAREHOUSE_WAREHOUSE;
  return CDEK_DELIVERY_MODES.WAREHOUSE_POSTAMAT;
};

/** True when the buyer picks a point rather than giving a street address. */
export const isPointKind = (kind: CdekDeliveryKind): boolean => kind !== "courier";

/**
 * `shipping_option.data` of a CDEK method. `tenant_id` is written here at
 * provisioning time on purpose: the fulfillment provider runs inside the
 * fulfillment module's container, which is handed the option's `data` and
 * nothing else about the shop, so without this the provider could not tell whose
 * CDEK account to price against. The same trick the tariff provider uses for the
 * zone label (`src/modules/tariff-fulfillment/service.ts`).
 */
export type CdekMethodData = {
  schema: typeof CDEK_METHOD_SCHEMA;
  tenant_id: string;
  kind: CdekDeliveryKind;
  /** Pinned tariff code, or `null` to take the cheapest tariff of the right mode. */
  tariff_code: number | null;
  /** Copied from the shop's settings so a price can be quoted without a second read. */
  sender_mode: CdekSenderMode;
  /** Kilograms are never used here: CDEK counts grams and so does the cart. */
  default_weight_g: number;
  /** Added to every quote, in the cart currency. The shop's packing fee. */
  markup_amount: number;
  /** Percent added on top of the carrier price, 0 for none. */
  markup_percent: number;
  /** Free above this cart total, `null` for never. */
  free_above_total: number | null;
};

export const isCdekMethodData = (data: unknown): data is CdekMethodData =>
  typeof data === "object" &&
  data !== null &&
  (data as { schema?: unknown }).schema === CDEK_METHOD_SCHEMA &&
  typeof (data as { tenant_id?: unknown }).tenant_id === "string";

/* ------------------------------------------------------------- selection */

export type QuoteItem = {
  quantity: number;
  unit_price: number;
  weight?: number | null;
  product_weight?: number | null;
};

/**
 * Total cart weight in grams. A variant without a weight falls back to its
 * product's, then to the shop's default: a zero would quote the minimum tariff
 * for a parcel that cannot be shipped for it, and the owner would find out from
 * the carrier's invoice.
 */
export const cartWeightGrams = (items: QuoteItem[], defaultWeightG: number): number => {
  const total = items.reduce((sum, item) => {
    const own = item.weight ?? item.product_weight ?? null;
    const weight = typeof own === "number" && own > 0 ? own : defaultWeightG;
    return sum + weight * Math.max(1, Number(item.quantity) || 1);
  }, 0);
  return Math.max(1, Math.round(total));
};

export const cartSubtotal = (items: QuoteItem[]): number =>
  items.reduce((sum, item) => sum + Number(item.unit_price ?? 0) * Number(item.quantity ?? 0), 0);

export type SelectedTariff = {
  tariff: CdekTariff;
  /** Carrier price, before the shop's markup. */
  carrier_amount: number;
  /** What the buyer pays. */
  amount: number;
  period_min: number;
  period_max: number;
  free: boolean;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The cheapest tariff of the requested delivery mode, with the shop's markup
 * applied. A pinned `tariff_code` wins when it is present in the answer; when it
 * is not (CDEK drops a tariff that cannot serve the route), the cheapest of the
 * same mode is used rather than failing the checkout — the buyer sees a price
 * that is real, and `selected.tariff.tariff_code` records which one it was.
 */
export const selectTariff = (
  tariffs: CdekTariff[],
  options: {
    delivery_mode: number;
    tariff_code?: number | null;
    markup_amount?: number;
    markup_percent?: number;
    free_above_total?: number | null;
    subtotal?: number;
  },
): SelectedTariff | null => {
  const ofMode = tariffs.filter((tariff) => tariff.delivery_mode === options.delivery_mode);
  if (!ofMode.length) return null;

  const pinned = options.tariff_code
    ? ofMode.find((tariff) => tariff.tariff_code === options.tariff_code)
    : undefined;
  const cheapest = ofMode.reduce((best, tariff) =>
    tariff.delivery_sum < best.delivery_sum ? tariff : best,
  );
  const tariff = pinned ?? cheapest;

  const carrier = Math.max(0, Number(tariff.delivery_sum) || 0);
  const withPercent = carrier * (1 + Math.max(0, options.markup_percent ?? 0) / 100);
  const withMarkup = withPercent + Math.max(0, options.markup_amount ?? 0);

  const threshold = options.free_above_total;
  const free =
    typeof threshold === "number" && threshold > 0 && (options.subtotal ?? 0) >= threshold;

  return {
    tariff,
    carrier_amount: round2(carrier),
    amount: free ? 0 : round2(withMarkup),
    period_min: Number(tariff.period_min) || 0,
    period_max: Number(tariff.period_max) || 0,
    free,
  };
};

/** «1-2 дня» / «3 дня» — the term a checkout card shows next to the price. */
export const termLabel = (min: number, max: number): string => {
  const days = (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "день";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
    return "дней";
  };
  if (!min && !max) return "";
  if (!max || min === max) return `${min || max} ${days(min || max)}`;
  return `${min}-${max} ${days(max)}`;
};
