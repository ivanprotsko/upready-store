import fs from "node:fs";
import path from "node:path";
import { getStoreProfile, readProfileJson } from "../store-profile";

export type SeedPickupPointAddress = {
  address_1: string;
  city: string;
  postal_code: string;
  country_code: string;
};

export type SeedPickupPoint = {
  name: string;
  address: SeedPickupPointAddress;
  /** Plain text, e.g. "Mon–Sat 10:00–20:00" — stored on `stock_location.metadata.opening_hours` (Ivan's fork answer F6). */
  opening_hours: string;
};

/**
 * `data/profiles/<id>/pickup-points.json`, F6's "4 pickup points per profile
 * in the persona city" (`2026-09-09-wave1-critique-and-plan.md` §F6). Read
 * the same way a profile's own catalog files are (`data/products/index.ts`),
 * through `getStoreProfile()`/`readProfileJson()`.
 *
 * Empty when no `STORE_PROFILE` is active — the default demo seed keeps
 * today's single generic "Pickup" shipping option and seeds no per-profile
 * pickup points at all, unchanged from before this package — and empty when
 * the active profile ships no `pickup-points.json` of its own (a profile
 * fixture used only for other tests, or a future profile that chooses not to
 * offer pickup), so this module never forces every profile to carry the file.
 */
export const SEED_PICKUP_POINTS: SeedPickupPoint[] = (() => {
  const profile = getStoreProfile();
  if (!profile) return [];
  if (!fs.existsSync(path.join(profile.dir, "pickup-points.json"))) return [];
  return readProfileJson<SeedPickupPoint[]>(profile.dir, "pickup-points.json");
})();
