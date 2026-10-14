/**
 * The carriers a shop ships through ApiShip, in the owner's and the buyer's
 * words (t-2026-10-14-58).
 *
 * ApiShip names a carrier by a `providerKey` (`GET /lists/providers`, 36 keys
 * on 14.10.2026). The two this task is about are `cdek` and `rupost`; any
 * other key the cabinet has connected works the same way and is shown by the
 * name ApiShip gives it, so a third carrier costs no code (d-2026-10-14-293).
 */

import type { ApishipDeliveryKind } from "./method";

/** Keys ApiShip uses for the two carriers Ivan named. */
export const APISHIP_CDEK = "cdek";
export const APISHIP_RUPOST = "rupost";

/** The carriers offered by default when the owner has not chosen any. */
export const APISHIP_DEFAULT_CARRIERS: readonly string[] = [APISHIP_CDEK, APISHIP_RUPOST];

/** Owner-facing names for the keys this product knows; anything else takes ApiShip's own name. */
export const APISHIP_CARRIER_LABELS: Record<string, string> = {
  cdek: "СДЭК",
  rupost: "Почта России",
  boxberry: "Boxberry",
  dpd: "DPD",
  yataxi: "Яндекс Доставка",
  dostavista: "Dostavista",
  "5post": "5Post",
  ozonlog: "Ozon Логистика",
  pony: "Pony Express",
  dellin: "Деловые Линии",
  pecom: "ПЭК",
};

export const carrierLabel = (providerKey: string, fallbackName?: string | null): string =>
  APISHIP_CARRIER_LABELS[providerKey] ?? (fallbackName?.trim() || providerKey);

/**
 * The name and the description a checkout card shows for one (carrier, kind).
 * The names match the direct СДЭК and Почта methods on purpose: the buyer does
 * not care which road the price came by, and a shop switches one road on at a
 * time (the settings answer names the duplicates it would create).
 */
export const apishipMethodCopy = (
  providerKey: string,
  kind: ApishipDeliveryKind,
  fallbackName?: string | null,
): { name: string; description: string } => {
  const label = carrierLabel(providerKey, fallbackName);
  if (providerKey === APISHIP_RUPOST) {
    return kind === "courier"
      ? { name: "Почта России — курьером до двери", description: "Курьер Почты России привезёт заказ по вашему адресу." }
      : { name: "Почта России — до отделения", description: "Заберите заказ в отделении Почты России." };
  }
  return kind === "courier"
    ? { name: `${label} — курьером до двери`, description: `Курьер ${label} привезёт заказ по вашему адресу.` }
    : { name: `${label} — пункт выдачи`, description: `Заберите заказ в пункте выдачи ${label}.` };
};

/**
 * The direct providers of the same carrier, so the settings answer can name the
 * shop's methods a buyer would take for the same thing (the way `/tenants/pochta`
 * lists its `duplicates`).
 */
export const DIRECT_PROVIDER_OF_CARRIER: Record<string, string> = {
  cdek: "cdek_cdek",
  rupost: "pochta_pochta",
};
