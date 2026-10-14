/**
 * One price and one term for a Russian Post parcel (46df-pochta), shared by the
 * fulfillment provider and the storefront's quote route so the price the buyer
 * previews on a point is the price the cart is charged.
 *
 * Three sources, tried in this order:
 *
 * 1. With the shop's user key, the contract tariff of the «Отправка» API: ECOM
 *    to a «Почта Еком» point, «Посылка» to a post office. NOT MEASURED — no
 *    shop has a user key yet; a failure falls through to the public estimate
 *    and is logged, so a wrong key cannot take the delivery off the checkout.
 * 2. To a post office, the public calculator's «Посылка» to that office.
 * 3. To a «Почта Еком» point, the public «Посылка» to the main office of the
 *    point's region (`regions.ts`), because the public calculator prices
 *    nothing to a 98xxxx index. Marked `public-retail-estimate`.
 */

import {
  listDeliveryPoints,
  otpravkaTariff,
  publicTariff,
  PochtaError,
  type PochtaClientOptions,
  type PochtaCredentials,
  type PochtaTariffQuote,
} from "./client";
import {
  fromDeliveryPoint,
  isBuyerPoint,
  termLabel,
  type PochtaPointKind,
  type PochtaStorePoint,
  type PochtaTariffSource,
} from "./method";
import { referenceIndexForRegion } from "./regions";

export type PochtaQuote = {
  /** What the buyer pays, rubles. */
  amount: number;
  /** What the carrier charges, rubles; equal to `amount` while there is no markup. */
  carrier_amount: number;
  period_min: number;
  period_max: number;
  term_label: string;
  tariff_source: PochtaTariffSource;
  weight_g: number;
};

type Logger = { warn: (message: string) => void } | undefined;

const PUBLIC_CACHE_TTL_MS = 10 * 60 * 1000;
const publicCache = new Map<string, { at: number; quote: PochtaTariffQuote }>();

/** The public calculator, cached for ten minutes per (from, to, weight). */
const cachedPublicTariff = async (
  input: { from_index: string; to_index: string; weight_g: number },
  options: PochtaClientOptions,
): Promise<PochtaTariffQuote> => {
  const key = `${input.from_index}|${input.to_index}|${input.weight_g}`;
  const now = (options.now ?? Date.now)();
  const hit = publicCache.get(key);
  if (hit && now - hit.at < PUBLIC_CACHE_TTL_MS) return hit.quote;
  const quote = await publicTariff(input, options);
  publicCache.set(key, { at: now, quote });
  return quote;
};

export const forgetPochtaQuotes = (): void => publicCache.clear();

const shape = (quote: PochtaTariffQuote, source: PochtaTariffSource, weight: number): PochtaQuote => {
  const amount = Math.round(quote.amount * 100) / 100;
  return {
    amount,
    carrier_amount: amount,
    period_min: quote.period_min,
    period_max: quote.period_max,
    term_label: termLabel(quote.period_min, quote.period_max),
    tariff_source: source,
    weight_g: weight,
  };
};

/**
 * The point the cart asked for, looked up in the carrier's directory rather
 * than taken from the client: the name and the address the order keeps are
 * the carrier's own. A post office (the user-key path) has no directory row
 * here, so its index is kept with the name the client sent.
 */
export const findPochtaPoint = async (
  credentials: PochtaCredentials,
  requested: { index: string; kind: PochtaPointKind },
  options: PochtaClientOptions = {},
): Promise<PochtaStorePoint | null> => {
  if (requested.kind === "office") {
    if (!credentials.user_key) return null;
    return {
      index: requested.index,
      kind: "office",
      name: `Отделение Почты России ${requested.index}`,
      address: "",
      city: null,
      region: null,
      lat: 0,
      lng: 0,
      work_time: [],
      weight_limit_g: null,
      card_payment: null,
      cash_payment: null,
      directions: null,
    };
  }
  const directory = await listDeliveryPoints(credentials, options);
  const raw = directory.find((row) => row["delivery-point-index"] === requested.index && isBuyerPoint(row));
  return raw ? fromDeliveryPoint(raw) : null;
};

/** The buyer points of the directory, in the storefront's shape. Cached by the client for six hours. */
export const directoryBuyerPoints = async (
  credentials: PochtaCredentials,
  options: PochtaClientOptions = {},
): Promise<PochtaStorePoint[]> =>
  (await listDeliveryPoints(credentials, options)).filter(isBuyerPoint).map(fromDeliveryPoint);

export const quoteToPoint = async (
  input: {
    credentials: PochtaCredentials;
    sender_index: string;
    point: Pick<PochtaStorePoint, "index" | "kind" | "region">;
    weight_g: number;
  },
  options: PochtaClientOptions & { logger?: Logger } = {},
): Promise<PochtaQuote> => {
  const { credentials, sender_index, point, weight_g } = input;
  if (!/^\d{6}$/.test(sender_index)) {
    throw new PochtaError("В настройках Почты России не указан индекс отделения отправителя");
  }

  if (credentials.user_key) {
    try {
      const contract = await otpravkaTariff(
        credentials,
        { from_index: sender_index, to_index: point.index, weight_g, kind: point.kind },
        options,
      );
      return shape(contract, "otpravka", weight_g);
    } catch (error) {
      options.logger?.warn(
        `[pochta] contract tariff failed, falling back to the public calculator: ${(error as Error).message}`,
      );
    }
  }

  if (point.kind === "office") {
    const retail = await cachedPublicTariff({ from_index: sender_index, to_index: point.index, weight_g }, options);
    return shape(retail, "public-retail", weight_g);
  }

  const reference = referenceIndexForRegion(point.region);
  if (!reference) {
    throw new PochtaError(`Нет опорного индекса для региона «${point.region ?? "?"}»`);
  }
  const estimate = await cachedPublicTariff({ from_index: sender_index, to_index: reference, weight_g }, options);
  return shape(estimate, "public-retail-estimate", weight_g);
};

/**
 * The price the method shows BEFORE a point is chosen: to the buyer's own
 * postcode when it is an ordinary office index, else to the main office of
 * the buyer's region. `null` when the address names neither, and the option
 * then drops out of the list rather than showing a price it cannot back.
 */
export const quoteToAddress = async (
  input: {
    credentials: PochtaCredentials;
    sender_index: string;
    postal_code?: string | null;
    province?: string | null;
    weight_g: number;
  },
  options: PochtaClientOptions & { logger?: Logger } = {},
): Promise<PochtaQuote | null> => {
  const { sender_index, weight_g } = input;
  if (!/^\d{6}$/.test(sender_index)) return null;
  const postal = (input.postal_code ?? "").trim();
  if (/^\d{6}$/.test(postal) && !postal.startsWith("98")) {
    try {
      const retail = await cachedPublicTariff({ from_index: sender_index, to_index: postal, weight_g }, options);
      return shape(retail, "public-retail", weight_g);
    } catch (error) {
      options.logger?.warn(`[pochta] no public tariff to the buyer's postcode: ${(error as Error).message}`);
    }
  }
  const reference = referenceIndexForRegion(input.province);
  if (!reference) return null;
  const estimate = await cachedPublicTariff({ from_index: sender_index, to_index: reference, weight_g }, options);
  return shape(estimate, "public-retail-estimate", weight_g);
};
