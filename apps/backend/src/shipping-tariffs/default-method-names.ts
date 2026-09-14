/**
 * Names a new tenant's two provisioned delivery methods get, in the store's
 * default locale. Before this the workflow minted `<Shop> pickup` and
 * `<Shop> courier`, which reached the customer's checkout as written.
 *
 * Only the locales the panel and the emails already ship (ru, en) have a
 * dedicated entry; anything else falls back to English. The owner renames
 * them on `/shipping` in the panel the moment she wants something else.
 */
export type DefaultMethodNames = {
  pickup: { name: string; description: string };
  courier: { name: string; description: string };
};

const NAMES: Record<string, DefaultMethodNames> = {
  ru: {
    pickup: { name: "Самовывоз", description: "Заберите заказ со склада магазина." },
    courier: { name: "Курьером", description: "Доставка курьером до двери." },
  },
  en: {
    pickup: { name: "Pickup", description: "Pick up at the warehouse." },
    courier: { name: "Courier", description: "Courier delivery." },
  },
};

export const defaultMethodNames = (locale?: string | null): DefaultMethodNames => {
  const language = (locale ?? "").toLowerCase().split(/[-_]/)[0];
  return NAMES[language] ?? NAMES.en;
};

/** The store's default locale as the backend knows it (`STOREFRONT_DEFAULT_LOCALE`, the same variable the emails read). */
export const storeDefaultLocale = (): string => process.env.STOREFRONT_DEFAULT_LOCALE || "en";

/** Matches the machine-made names the first cut of the provisioning workflow wrote, for the rename script. */
export const isMachineMadeDefaultName = (name: string, tenantName: string): "pickup" | "courier" | null => {
  if (name === `${tenantName} pickup`) return "pickup";
  if (name === `${tenantName} courier`) return "courier";
  return null;
};
