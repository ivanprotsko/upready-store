import store from "./json/store.json";
import { getStoreProfile, type StoreProfileBrand } from "../store-profile";

export type SeedStore = {
  name: string;
  default_currency_code: string;
  sales_channel: {
    name: string;
    description: string;
  };
  publishable_api_key: {
    title: string;
  };
};

/**
 * A profile ships its own store identity. The sales channel name doubles as the
 * "already seeded" marker (`lib/store.ts`), so it has to carry the brand too —
 * otherwise a profile would look already-seeded in a database holding the demo
 * data, and vice versa.
 */
export const withBrand = (base: SeedStore, brand: StoreProfileBrand): SeedStore => ({
  ...base,
  name: brand.name,
  sales_channel: {
    name: `${brand.name} Sales Channel`,
    description: brand.tagline,
  },
  publishable_api_key: {
    title: `${brand.name} Publishable API Key`,
  },
});

const profile = getStoreProfile();

export const SEED_STORE: SeedStore = profile
  ? withBrand(store, profile.profile.brand)
  : store;
