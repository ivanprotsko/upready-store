/**
 * Tenant shipping tariffs: the pure arithmetic behind a shop owner's delivery
 * methods. No Medusa imports on purpose. The fulfillment provider
 * (`src/modules/tariff-fulfillment`), the store quote route
 * (`src/api/store/shipping-methods/quote`) and the unit tests all call the same
 * `quoteTariff`, so the number the checkout shows and the number Medusa writes
 * onto the cart's shipping method cannot drift apart.
 *
 * Weights are grams, the unit the panel's variant form edits. Amounts are in
 * the cart currency's major unit, the way Medusa 2 stores prices (10 = 10 EUR).
 */

export const TENANT_METHOD_SCHEMA = "upready.shipping-method/v1";

export type ShippingTariff =
  /** One price for the whole cart. */
  | { kind: "flat"; amount: number }
  /** `base_amount + per_kg_amount × weight_kg`; a cart lighter than `min_weight_g` is billed as `min_weight_g`. */
  | { kind: "per_kg"; base_amount: number; per_kg_amount: number; min_weight_g?: number | null }
  /** `amount`, or nothing once the cart's item total reaches `free_above_total`. */
  | { kind: "free_above"; amount: number; free_above_total: number };

export type TariffKind = ShippingTariff["kind"];

/** A zone the owner picked: one country, and for it either the whole country or a list of regions. */
export type MethodZone = {
  country_code: string;
  /** Region strings exactly as the storefront writes `shipping_address.province` (DaData `region_with_type`); empty = the whole country. */
  provinces: string[];
};

/** What a tenant method keeps in `shipping_option.data`. */
export type TenantMethodData = {
  schema: typeof TENANT_METHOD_SCHEMA;
  tariff: ShippingTariff;
  description: string | null;
  delivery_hint: string | null;
  sort_order: number;
  /** The tenant's fallback for a cart line whose variant has no weight, copied here so the provider can read it without knowing the tenant. */
  default_weight_g: number;
  /** True when the service zone was created for this method alone and goes with it on delete. */
  own_zone: boolean;
  /** `null` = the tenant's base zone (every country the store has a region for), where the provisioned defaults live. */
  zone: MethodZone | null;
};

export type QuoteItem = {
  quantity: number;
  unit_price: number;
  /** Variant weight in grams; null/undefined/0 falls back to the default. */
  weight?: number | null;
  /** Product weight in grams, the second fallback. */
  product_weight?: number | null;
};

export type QuoteInput = {
  items: QuoteItem[];
  currency_code: string;
  /** BCP-47 tag used for the explanation's number formatting; the cart's own locale. */
  locale?: string | null;
  default_weight_g: number;
};

export type Quote = {
  kind: TariffKind;
  amount: number;
  weight_g: number;
  item_total: number;
  /** True when at least one line had no weight and the default was used. */
  used_default_weight: boolean;
  /** One line the checkout shows under the price, e.g. «2,4 кг × 180 ₽ + 150 ₽». Empty for a plain flat price. */
  explanation: string;
};

const DEFAULT_WEIGHT_FALLBACK_G = 500;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Rounds to the currency's two minor digits; Medusa amounts are decimals, not cents. */
export const roundAmount = (amount: number): number => Math.round(amount * 100) / 100;

/**
 * Total cart weight in grams. A line without a variant weight takes the
 * product weight, then the tenant default; the flag tells the caller the
 * default was used so the panel can show that fallback rather than hide it.
 */
export const cartWeight = (
  items: QuoteItem[],
  defaultWeightG: number,
): { weight_g: number; used_default_weight: boolean } => {
  const fallback = isPositiveNumber(defaultWeightG) ? defaultWeightG : DEFAULT_WEIGHT_FALLBACK_G;
  let weight = 0;
  let usedDefault = false;
  for (const item of items) {
    const quantity = isPositiveNumber(item.quantity) ? item.quantity : 0;
    const perUnit = isPositiveNumber(item.weight)
      ? item.weight
      : isPositiveNumber(item.product_weight)
        ? item.product_weight
        : null;
    if (perUnit === null) {
      usedDefault = usedDefault || quantity > 0;
    }
    weight += (perUnit ?? fallback) * quantity;
  }
  return { weight_g: weight, used_default_weight: usedDefault };
};

export const cartItemTotal = (items: QuoteItem[]): number =>
  roundAmount(
    items.reduce(
      (sum, item) =>
        sum +
        (isPositiveNumber(item.unit_price) ? item.unit_price : 0) *
          (isPositiveNumber(item.quantity) ? item.quantity : 0),
      0,
    ),
  );

/** Intl pads with U+00A0/U+202F; the explanation is plain text, so plain spaces. */
const plainSpaces = (text: string): string => text.replace(/[\u00A0\u202F]/g, " ");

const formatMoney = (amount: number, currency: string, locale: string): string => {
  try {
    return plainSpaces(new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount));
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
};

const formatKg = (weightG: number, locale: string): string => {
  const kg = weightG / 1000;
  const number = plainSpaces(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(kg));
  return locale.toLowerCase().startsWith("ru") ? `${number} кг` : `${number} kg`;
};

const isRussian = (locale: string) => locale.toLowerCase().startsWith("ru");

/** Price + one-line explanation for one tariff against one cart. */
export const quoteTariff = (tariff: ShippingTariff, input: QuoteInput): Quote => {
  const locale = input.locale || "ru";
  const currency = input.currency_code;
  const { weight_g, used_default_weight } = cartWeight(input.items, input.default_weight_g);
  const item_total = cartItemTotal(input.items);
  const money = (amount: number) => formatMoney(amount, currency, locale);

  switch (tariff.kind) {
    case "flat": {
      return {
        kind: "flat",
        amount: roundAmount(tariff.amount),
        weight_g,
        item_total,
        used_default_weight,
        explanation: "",
      };
    }
    case "per_kg": {
      const minWeight = isPositiveNumber(tariff.min_weight_g) ? tariff.min_weight_g : 0;
      const billedG = Math.max(weight_g, minWeight);
      const kg = billedG / 1000;
      const amount = roundAmount(tariff.base_amount + tariff.per_kg_amount * kg);
      const parts = [`${formatKg(billedG, locale)} × ${money(tariff.per_kg_amount)}`];
      if (tariff.base_amount > 0) {
        parts.push(money(tariff.base_amount));
      }
      return {
        kind: "per_kg",
        amount,
        weight_g,
        item_total,
        used_default_weight,
        explanation: parts.join(" + "),
      };
    }
    case "free_above": {
      const free = item_total >= tariff.free_above_total;
      const threshold = money(tariff.free_above_total);
      return {
        kind: "free_above",
        amount: free ? 0 : roundAmount(tariff.amount),
        weight_g,
        item_total,
        used_default_weight,
        explanation: isRussian(locale)
          ? `Бесплатно при заказе от ${threshold}`
          : `Free on orders from ${threshold}`,
      };
    }
    default: {
      const never: never = tariff;
      throw new Error(`Unknown tariff kind: ${JSON.stringify(never)}`);
    }
  }
};

/** Type guard for what a shipping option's `data` may hold; anything else is not a tenant method. */
export const isTenantMethodData = (data: unknown): data is TenantMethodData =>
  typeof data === "object" &&
  data !== null &&
  (data as { schema?: unknown }).schema === TENANT_METHOD_SCHEMA &&
  typeof (data as { tariff?: unknown }).tariff === "object";

/** Validates a tariff shape coming from the API; returns a normalised copy or throws a plain Error the route turns into 400. */
export const normaliseTariff = (raw: unknown): ShippingTariff => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("tariff must be an object");
  }
  const t = raw as Record<string, unknown>;
  const nonNegative = (key: string): number => {
    const value = t[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`tariff.${key} must be a number >= 0`);
    }
    return roundAmount(value);
  };
  switch (t.kind) {
    case "flat":
      return { kind: "flat", amount: nonNegative("amount") };
    case "per_kg": {
      const min = t.min_weight_g;
      if (min !== undefined && min !== null && (typeof min !== "number" || min < 0)) {
        throw new Error("tariff.min_weight_g must be a number >= 0");
      }
      return {
        kind: "per_kg",
        base_amount: nonNegative("base_amount"),
        per_kg_amount: nonNegative("per_kg_amount"),
        min_weight_g: typeof min === "number" ? Math.round(min) : null,
      };
    }
    case "free_above":
      return {
        kind: "free_above",
        amount: nonNegative("amount"),
        free_above_total: nonNegative("free_above_total"),
      };
    default:
      throw new Error("tariff.kind must be one of flat, per_kg, free_above");
  }
};
