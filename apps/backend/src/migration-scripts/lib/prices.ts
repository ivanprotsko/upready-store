import { defaultCurrencies } from "@medusajs/framework/utils";
import { SEED_REGIONS, type SeedRegion } from "../data/regions";
import { getStoreProfile, type StoreProfileRounding } from "../data/store-profile";
import { toKey } from "./utils";

/**
 * A profile prices a variant once, in USD. The 241 region files of the demo seed
 * already carry a hand-tuned price per currency for every demo product, so the
 * cheapest honest way to price a profile in 118 currencies is to reuse the
 * demo's own spread: ratio[currency] = demo[currency] / demo[usd], taken from a
 * single product, then price_usd x ratio, rounded the way the profile asks.
 */
export const RATIO_PRODUCT_HANDLE = "t-shirt";

/**
 * How many decimal digits a currency has, from Medusa's own currency table
 * (`defaultCurrencies` in @medusajs/framework/utils — the same list the currency
 * module loads into the database). Never hand-write a list of zero-decimal
 * currencies: this one carries 126 currencies, 39 of them zero-decimal.
 */
export const currencyDecimalDigits = (currencyCode: string): number => {
  const currency = defaultCurrencies[
    currencyCode.toUpperCase() as keyof typeof defaultCurrencies
  ];

  if (!currency) {
    throw new Error(
      `Unknown currency "${currencyCode}" — it is not in Medusa's defaultCurrencies (@medusajs/framework/utils).`,
    );
  }

  return currency.decimal_digits;
};

export const buildRatioTable = (
  regions: SeedRegion[],
  handle: string = RATIO_PRODUCT_HANDLE,
): Record<string, number> => {
  const key = toKey(handle);
  const amountByCurrency = new Map<string, number>();

  for (const region of regions) {
    const amount = region.product_prices[key];
    if (amount === undefined) {
      throw new Error(
        `Ratio product "${handle}" has no price in region "${region.name}". The ratio table is derived from the demo seed, so every region file must price it.`,
      );
    }
    amountByCurrency.set(region.currency_code, amount);
  }

  const usd = amountByCurrency.get("usd");
  if (!usd) {
    throw new Error(
      `Ratio product "${handle}" has no USD price. Profile prices are quoted in USD, so a USD region is required.`,
    );
  }

  return Object.fromEntries(
    Array.from(amountByCurrency, ([currency, amount]) => [currency, amount / usd]),
  );
};

const roundToDigits = (amount: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(amount * factor) / factor;
};

/**
 * `charm` = a price that ends in nines: `x.99` where the currency has decimals,
 * `x9` where it has none (JPY, KRW, VND and the other 39 zero-decimal
 * currencies). `round` = whole tens.
 */
export const roundAmount = (
  amount: number,
  currencyCode: string,
  mode: StoreProfileRounding,
): number => {
  const digits = currencyDecimalDigits(currencyCode);

  if (mode === "round") {
    const tens = Math.max(1, Math.round(amount / 10)) * 10;
    return digits === 0 ? tens : roundToDigits(tens, digits);
  }

  if (digits === 0) {
    // nearest ten, minus one: always ends in 9.
    return Math.max(1, Math.round(amount / 10)) * 10 - 1;
  }

  // nearest whole unit, minus one cent: always ends in .99.
  return roundToDigits(Math.max(1, Math.round(amount)) - 0.01, digits);
};

export const pricesFromUsd = (
  priceUsd: number,
  {
    regions,
    ratios,
    rounding,
  }: {
    regions: SeedRegion[];
    ratios: Record<string, number>;
    rounding: StoreProfileRounding;
  },
) => {
  const amountByCurrency = new Map<string, number>();

  for (const region of regions) {
    const ratio = ratios[region.currency_code];
    if (ratio === undefined) {
      throw new Error(
        `Missing exchange ratio for currency "${region.currency_code}" (region "${region.name}"). Every region currency must appear in the ratio table.`,
      );
    }
    amountByCurrency.set(
      region.currency_code,
      roundAmount(priceUsd * ratio, region.currency_code, rounding),
    );
  }

  return Array.from(amountByCurrency, ([currency_code, amount]) => ({
    currency_code,
    amount,
  }));
};

let ratioTable: Record<string, number> | undefined;

/** Prices one profile variant in every seeded currency. */
export const getVariantPrices = (priceUsd: number) => {
  const profile = getStoreProfile();
  if (!profile) {
    throw new Error(
      "A variant carries price_usd but no store profile is active. price_usd is a profile field; set STORE_PROFILE or price the product per region.",
    );
  }

  ratioTable ??= buildRatioTable(SEED_REGIONS);

  return pricesFromUsd(priceUsd, {
    regions: SEED_REGIONS,
    ratios: ratioTable,
    rounding: profile.profile.currency.rounding,
  });
};
