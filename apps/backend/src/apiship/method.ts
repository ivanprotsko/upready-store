/**
 * What an ApiShip shipping option carries in `shipping_option.data`, what the
 * cart's method records once the buyer chose it, and how a calculator answer
 * turns into one price and one term (t-2026-10-14-58).
 *
 * Pure functions only, so the fulfillment provider, the store routes and the
 * unit tests agree on the same arithmetic. The network lives in `client.ts`.
 */

import type { ApishipCalculatorGroup, ApishipCalculatorTariff } from "./client";

export { cartSubtotal, cartWeightGrams, termLabel, type QuoteItem } from "../cdek/method";

export const APISHIP_METHOD_SCHEMA = "upready.apiship-method/v1" as const;

/** Where the parcel ends up: at the buyer's door, or at a carrier's point (an office, a locker, a post office). */
export type ApishipDeliveryKind = "courier" | "pickup";

/** How the shop hands the parcel over: a courier collects it, or the shop brings it to a carrier's point. */
export type ApishipSenderMode = "courier" | "point";

/** ApiShip `deliveryType`: 1 to the door, 2 to a point (`GET /lists/deliveryTypes`). */
export const deliveryTypeFor = (kind: ApishipDeliveryKind): 1 | 2 => (kind === "courier" ? 1 : 2);

/** ApiShip `pickupType`: 1 a courier collects from the shop, 2 the shop brings the parcel in (`GET /lists/pickupTypes`). */
export const pickupTypeFor = (mode: ApishipSenderMode): 1 | 2 => (mode === "courier" ? 1 : 2);

/**
 * `shipping_option.data` of an ApiShip method. `tenant_id` is written at
 * provisioning time for the reason `CdekMethodData` documents: the provider runs
 * in the fulfillment module's container and sees nothing of the shop but this
 * object. `provider_key` is ApiShip's carrier key (`cdek`, `rupost`, …).
 */
export type ApishipMethodData = {
  schema: typeof APISHIP_METHOD_SCHEMA;
  tenant_id: string;
  provider_key: string;
  kind: ApishipDeliveryKind;
  /** A pinned ApiShip tariff id, or `null` to take the cheapest the calculator returns. */
  tariff_id: number | null;
  /** The cabinet's connection to this carrier (`/connections` id), when it has several; `null` lets ApiShip choose. */
  connection_id: string | null;
  /** Grams for a unit whose variant and product carry no weight. */
  default_weight_g: number;
  /** Added to every quote, in the cart currency. The shop's packing fee. */
  markup_amount: number;
  /** Percent added on top of the carrier price, 0 for none. */
  markup_percent: number;
  /** Free above this cart total, `null` for never. */
  free_above_total: number | null;
};

export const isApishipMethodData = (data: unknown): data is ApishipMethodData =>
  typeof data === "object" &&
  data !== null &&
  (data as { schema?: unknown }).schema === APISHIP_METHOD_SCHEMA &&
  typeof (data as { tenant_id?: unknown }).tenant_id === "string" &&
  typeof (data as { provider_key?: unknown }).provider_key === "string";

/**
 * What the cart's (and then the order's) shipping method keeps in `data`. The
 * storefront sends `apiship_point_id` when the buyer picked a point; every
 * other field the server writes, so the order records enough to create the
 * shipment later without asking ApiShip again.
 */
export type ApishipShippingMethodData = {
  provider: "apiship";
  tenant_id: string;
  provider_key: string;
  kind: ApishipDeliveryKind;
  apiship_connection_id: string | null;
  apiship_point_id: number | null;
  apiship_point_code: string | null;
  apiship_point_name: string | null;
  apiship_point_address: string | null;
  tariff_id: number | null;
  tariff_name: string | null;
  period_min: number | null;
  period_max: number | null;
  term_label: string | null;
  carrier_amount: number | null;
  weight_g: number | null;
  default_weight_g: number | null;
  /** Set by `createFulfillment`; read by the panel, the documents routes and the status sync. */
  apiship_order_id?: number | null;
  /** The carrier's own number, once ApiShip has it (`ORDER_NUMBER_UPDATE`, or the first status read). */
  apiship_provider_number?: string | null;
  apiship_tracking_url?: string | null;
  apiship_status?: string | null;
  apiship_status_at?: string | null;
  apiship_status_name?: string | null;
  /** The carrier's own explanation of the status, when it gave one («выбранный тариф недоступен»). */
  apiship_status_detail?: string | null;
  apiship_statuses?: Array<Record<string, unknown>>;
  apiship_client_number?: string | null;
};

export const isApishipShippingMethodData = (data: unknown): data is ApishipShippingMethodData =>
  typeof data === "object" &&
  data !== null &&
  (data as { provider?: unknown }).provider === "apiship" &&
  typeof (data as { tenant_id?: unknown }).tenant_id === "string";

/** The point the storefront asked for, read tolerantly: a number, or a numeric string. */
export const requestedPointId = (data: Record<string, unknown> | null | undefined): number | null => {
  const raw = data?.apiship_point_id;
  const id = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
};

/* ------------------------------------------------------------- selection */

export type SelectedApishipTariff = {
  tariff: ApishipCalculatorTariff;
  /** Carrier price, before the shop's markup. */
  carrier_amount: number;
  /** What the buyer pays. */
  amount: number;
  period_min: number;
  period_max: number;
  free: boolean;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Calendar days when ApiShip gives them, else the deprecated `daysMin/Max`, else 0. */
export const tariffDays = (tariff: ApishipCalculatorTariff): { min: number; max: number } => {
  const min = tariff.calendarDaysMin ?? tariff.daysMin ?? 0;
  const max = tariff.calendarDaysMax ?? tariff.daysMax ?? min;
  return { min: Number(min) || 0, max: Number(max) || 0 };
};

/**
 * The cheapest tariff of the requested carrier, with the shop's markup applied.
 * A pinned `tariff_id` wins when it is present in the answer; when it is not
 * (ApiShip drops a tariff that cannot serve the route), the cheapest is used
 * rather than failing the checkout, and `selected.tariff.tariffId` records
 * which one it was. `null` when the carrier returned no tariff at all.
 */
export const selectApishipTariff = (
  groups: ApishipCalculatorGroup[] | null | undefined,
  options: {
    provider_key: string;
    tariff_id?: number | null;
    markup_amount?: number;
    markup_percent?: number;
    free_above_total?: number | null;
    subtotal?: number;
  },
): SelectedApishipTariff | null => {
  const group = (groups ?? []).find((entry) => entry.providerKey === options.provider_key);
  const tariffs = (group?.tariffs ?? []).filter(
    (tariff) => typeof tariff.deliveryCost === "number" && Number.isFinite(tariff.deliveryCost),
  );
  if (!tariffs.length) return null;

  const pinned = options.tariff_id
    ? tariffs.find((tariff) => tariff.tariffId === options.tariff_id)
    : undefined;
  const cheapest = tariffs.reduce((best, tariff) =>
    tariff.deliveryCost < best.deliveryCost ? tariff : best,
  );
  const tariff = pinned ?? cheapest;

  const carrier = Math.max(0, Number(tariff.deliveryCost) || 0);
  const withPercent = carrier * (1 + Math.max(0, options.markup_percent ?? 0) / 100);
  const withMarkup = withPercent + Math.max(0, options.markup_amount ?? 0);

  const threshold = options.free_above_total;
  const free =
    typeof threshold === "number" && threshold > 0 && (options.subtotal ?? 0) >= threshold;

  const days = tariffDays(tariff);
  return {
    tariff,
    carrier_amount: round2(carrier),
    amount: free ? 0 : round2(withMarkup),
    period_min: days.min,
    period_max: days.max,
    free,
  };
};
