/**
 * What a Russian Post shipping option carries in `shipping_option.data`, what a
 * pickup point looks like to the storefront, and how the directory is searched
 * (46df-pochta).
 *
 * Pure functions only, so the fulfillment provider, the store routes and the
 * unit tests agree on the same arithmetic. The network lives in `client.ts`.
 */

import type { PochtaDeliveryPointRaw, PochtaPostOfficeRaw } from "./client";

export { cartSubtotal, cartWeightGrams, termLabel, type QuoteItem } from "../cdek/method";

export const POCHTA_METHOD_SCHEMA = "upready.pochta-method/v1" as const;

/**
 * `shipping_option.data` of the Russian Post method. `tenant_id` is written at
 * provisioning time for the reason `CdekMethodData` documents: the provider
 * runs in the fulfillment module's container and sees nothing of the shop but
 * this object.
 */
export type PochtaMethodData = {
  schema: typeof POCHTA_METHOD_SCHEMA;
  tenant_id: string;
  kind: "pickup";
  /** Grams, for an item whose variant and product carry no weight. */
  default_weight_g: number;
};

export const isPochtaMethodData = (data: unknown): data is PochtaMethodData =>
  typeof data === "object" &&
  data !== null &&
  (data as { schema?: unknown }).schema === POCHTA_METHOD_SCHEMA &&
  typeof (data as { tenant_id?: unknown }).tenant_id === "string";

/** `pvz` a «Почта Еком» pickup point from the directory, `office` a post office (user key only). */
export type PochtaPointKind = "pvz" | "office";

/** The point shape the storefront picker and its map consume. */
export type PochtaStorePoint = {
  /** The point's own index; unique across both kinds, and what the cart stores. */
  index: string;
  kind: PochtaPointKind;
  name: string;
  /** Street and house, without the region and the city the list already shows. */
  address: string;
  city: string | null;
  region: string | null;
  lat: number;
  lng: number;
  /** One line per weekday, as the carrier words it («пн, открыто: 09:00 - 21:00»). */
  work_time: string[];
  /** Grams; `null` when the carrier gave none. */
  weight_limit_g: number | null;
  card_payment: boolean | null;
  cash_payment: boolean | null;
  /** «Как пройти», the carrier's own directions. */
  directions: string | null;
};

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

/**
 * True for the rows a buyer can collect from. The directory also lists sorting
 * hubs (no `type-post-office`, no `service-ids`: Вешки, Хоругвино,
 * «Екатеринбург-2»), measured 65 of 1035 on 2026-09-29; those, and anything
 * closed, never reach the checkout.
 */
export const isBuyerPoint = (raw: PochtaDeliveryPointRaw): boolean =>
  raw["type-post-office"] === "PPVZ" &&
  !raw.closed &&
  !raw["temporary-closed"] &&
  toNumber(raw.latitude) !== null &&
  toNumber(raw.longitude) !== null;

/** «г. Москва» → «Москва»: the settlement without its type prefix. */
export const placeName = (place?: string | null): string =>
  (place ?? "")
    .replace(/^(г|гор|пгт|рп|п|пос|с|д|х|ст-ца|мкр|тер|платф|ш|п\/р)\.?\s+/i, "")
    .trim();

export const fromDeliveryPoint = (raw: PochtaDeliveryPointRaw): PochtaStorePoint => {
  const street = [raw.address?.street, raw.address?.house].filter(Boolean).join(", ");
  return {
    index: raw["delivery-point-index"],
    kind: "pvz",
    name: raw["brand-name"] ? `${raw["brand-name"]} ${raw["delivery-point-index"]}` : `Пункт выдачи ${raw["delivery-point-index"]}`,
    address: street || raw.address?.place || "",
    city: placeName(raw.address?.place) || null,
    region: raw.address?.region ?? null,
    lat: toNumber(raw.latitude) ?? 0,
    lng: toNumber(raw.longitude) ?? 0,
    work_time: Array.isArray(raw["work-time"]) ? raw["work-time"].filter((line) => typeof line === "string") : [],
    weight_limit_g: typeof raw["weight-limit"] === "number" ? raw["weight-limit"] : null,
    card_payment: typeof raw["card-payment"] === "boolean" ? raw["card-payment"] : null,
    cash_payment: typeof raw["cash-payment"] === "boolean" ? raw["cash-payment"] : null,
    directions: raw.getto?.trim() || null,
  };
};

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** A post office from `/postoffice/1.0/nearby` (user key only, not measured). */
export const fromPostOffice = (raw: PochtaPostOfficeRaw): PochtaStorePoint | null => {
  const index = String(raw["postal-code"] ?? "").trim();
  const lat = toNumber(raw.latitude);
  const lng = toNumber(raw.longitude);
  if (!/^\d{6}$/.test(index) || lat === null || lng === null) return null;
  if (raw["is-closed"] || raw["is-temporary-closed"]) return null;
  const hours = (raw["working-hours"] ?? [])
    .filter((day) => typeof day["weekday-id"] === "number")
    .map((day) => {
      const name = WEEKDAYS[(day["weekday-id"] ?? 1) - 1] ?? "";
      return day["begin-worktime"] && day["end-worktime"]
        ? `${name}, открыто: ${day["begin-worktime"].slice(0, 5)} - ${day["end-worktime"].slice(0, 5)}`
        : `${name}, закрыто`;
    });
  return {
    index,
    kind: "office",
    name: `Отделение Почты России ${index}`,
    address: raw["address-source"] ?? "",
    city: raw.settlement ?? null,
    region: raw.region ?? null,
    lat,
    lng,
    work_time: hours,
    weight_limit_g: null,
    card_payment: null,
    cash_payment: null,
    directions: null,
  };
};

/* ---------------------------------------------------------------- search */

const fold = (value: string): string => value.toLowerCase().replace(/ё/g, "е").trim();

export type PochtaCity = {
  name: string;
  region: string | null;
  /** Buyer points the directory holds there. */
  points: number;
  /** The average of its points, where the map centres. */
  lat: number;
  lng: number;
};

/**
 * The settlements of the directory whose name starts with (or, failing that,
 * contains) the buyer's text, the biggest first. The suggest is built from the
 * directory itself, so every city it offers has at least one point, and no
 * third-party geocoder is involved.
 */
export const citiesMatching = (points: PochtaStorePoint[], term: string, limit = 10): PochtaCity[] => {
  const needle = fold(term);
  if (needle.length < 2) return [];
  const byCity = new Map<string, PochtaCity & { latSum: number; lngSum: number }>();
  for (const point of points) {
    if (!point.city) continue;
    const key = `${point.city}|${point.region ?? ""}`;
    const entry = byCity.get(key) ?? {
      name: point.city,
      region: point.region,
      points: 0,
      lat: 0,
      lng: 0,
      latSum: 0,
      lngSum: 0,
    };
    entry.points += 1;
    entry.latSum += point.lat;
    entry.lngSum += point.lng;
    byCity.set(key, entry);
  }
  const all = [...byCity.values()].map(({ latSum, lngSum, ...city }) => ({
    ...city,
    lat: latSum / city.points,
    lng: lngSum / city.points,
  }));
  const starts = all.filter((city) => fold(city.name).startsWith(needle));
  const contains = all.filter((city) => !fold(city.name).startsWith(needle) && fold(city.name).includes(needle));
  const bySize = (a: PochtaCity, b: PochtaCity) => b.points - a.points || a.name.localeCompare(b.name, "ru");
  return [...starts.sort(bySize), ...contains.sort(bySize)].slice(0, limit);
};

/** The points of one settlement, matched on the name without its prefix. */
export const pointsInCity = (points: PochtaStorePoint[], city: string, region?: string | null): PochtaStorePoint[] => {
  const wanted = fold(placeName(city));
  const wantedRegion = region ? fold(region) : null;
  return points.filter(
    (point) =>
      fold(point.city ?? "") === wanted && (!wantedRegion || fold(point.region ?? "") === wantedRegion),
  );
};

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * One settlement's points without the ones whose coordinates cannot be right:
 * farther than `maxKm` from the median of the settlement. Measured on
 * 2026-09-29, one of Moscow's 137 directory points sits near Vitebsk, so the
 * map fitted to the list opened on half of central Russia, and a buyer who
 * picked that marker would have chosen a point the carrier places in Moscow.
 * The median, not the mean, so one outlier cannot drag the centre toward itself.
 */
export const withoutFarOutliers = (points: PochtaStorePoint[], maxKm = 100): PochtaStorePoint[] => {
  if (points.length < 3) return points;
  const centre = { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
  return points.filter((point) => distanceKm(centre, point) <= maxKm);
};

/**
 * The points the checkout's sheet offers for a city, in the order it lists them.
 * `GET /store/pochta/points?city=` answers this list, and the method card is priced
 * to its first point (t-2026-10-14-58), so the card never shows a price that no
 * offered point has.
 */
export const cityPoints = (points: PochtaStorePoint[], city: string, region?: string | null): PochtaStorePoint[] =>
  withoutFarOutliers(pointsInCity(points, city, region));

/** Points within `radiusKm` of a map centre, nearest first, at most `limit`. */
export const pointsNear = (
  points: PochtaStorePoint[],
  centre: { lat: number; lng: number },
  radiusKm: number,
  limit = 300,
): PochtaStorePoint[] =>
  points
    .map((point) => ({ point, distance: distanceKm(centre, point) }))
    .filter((entry) => entry.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((entry) => entry.point);

/* ------------------------------------------------------- method data on the cart */

/**
 * Where the tariff came from, written on the cart's shipping method so the
 * owner can tell an exact price from an estimate:
 * - `otpravka` the contract tariff of the «Отправка» API (user key);
 * - `public-retail` the public calculator's «Посылка» to the office itself;
 * - `public-retail-estimate` the public «Посылка» to the main office of the
 *   point's region, because the public calculator prices nothing to a
 *   «Почта Еком» point (`regions.ts`).
 */
export type PochtaTariffSource = "otpravka" | "public-retail" | "public-retail-estimate";

/** What the cart's (and then the order's) shipping method keeps in `data`. */
export type PochtaShippingMethodData = {
  provider: "pochta";
  tenant_id: string;
  kind: "pickup";
  pochta_point_index: string;
  pochta_point_kind: PochtaPointKind;
  pochta_point_name: string | null;
  pochta_point_address: string | null;
  pochta_point_city: string | null;
  pochta_point_region: string | null;
  tariff_source: PochtaTariffSource | null;
  carrier_amount: number | null;
  period_min: number | null;
  period_max: number | null;
  term_label: string | null;
  weight_g: number | null;
};

/** The point the client asked for, before the server looks it up. */
export const requestedPoint = (
  data: Record<string, unknown> | null | undefined,
): { index: string; kind: PochtaPointKind } | null => {
  const index = typeof data?.pochta_point_index === "string" ? data.pochta_point_index.trim() : "";
  if (!/^\d{6}$/.test(index)) return null;
  return { index, kind: data?.pochta_point_kind === "office" ? "office" : "pvz" };
};
