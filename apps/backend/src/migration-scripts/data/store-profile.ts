import fs from "node:fs";
import path from "node:path";

/**
 * Store profiles: one directory per store version under `data/profiles/<id>/`.
 *
 * `STORE_PROFILE=<id>` swaps the catalog, the catalog translations and the store
 * identity the seed reads. When the variable is unset every data module falls
 * back to the files it has always read, so the default seed is unchanged.
 *
 * `STORE_PROFILE_DIR` overrides the directory the id resolves to. It exists so a
 * fixture profile can live outside `data/profiles/` (tests, dry runs); the id
 * still names the profile in error messages and in the DB name chosen by
 * `scripts/store-profile-up.mjs`.
 */
export const PROFILES_DIR = path.join(__dirname, "profiles");

export type StoreProfileBrand = {
  name: string;
  tagline: string;
  wordmark: { text: string; style: "wordmark" | "monogram" };
  legalName?: string;
};

export type StoreProfileRounding = "charm" | "round";

export type StoreProfile = {
  schema: string;
  id: string;
  vertical: string;
  brand: StoreProfileBrand;
  locale: { default: string; catalogLocales: string[] };
  currency: { base: string; rounding: StoreProfileRounding };
  catalog: {
    files: {
      categories: string;
      productOptions: string;
      products: string;
      collections: string;
    };
    counts: { products: number; variants: number; images: number };
  };
  media: { dir: string; manifest: string; baseUrlEnv: string };
  [key: string]: unknown;
};

export type StoreProfileContext = {
  id: string;
  dir: string;
  profile: StoreProfile;
  mediaBaseUrl: string;
};

/**
 * Resolves `STORE_PROFILE` (and the optional `STORE_PROFILE_DIR` override) to a
 * directory. `null` means "no profile selected" — the default seed data.
 */
export const resolveProfileDir = (
  env: NodeJS.ProcessEnv = process.env,
): { id: string; dir: string } | null => {
  const id = (env.STORE_PROFILE ?? "").trim();
  if (!id) return null;

  const override = (env.STORE_PROFILE_DIR ?? "").trim();
  const dir = override ? path.resolve(override) : path.join(PROFILES_DIR, id);

  if (!fs.existsSync(dir)) {
    throw new Error(
      `STORE_PROFILE="${id}" points at "${dir}", which does not exist. Create the profile directory or unset STORE_PROFILE to seed the default demo data.`,
    );
  }

  return { id, dir };
};

export const readProfileJson = <T>(dir: string, relativePath: string): T => {
  const file = path.join(dir, relativePath);
  if (!fs.existsSync(file)) {
    throw new Error(`Store profile "${dir}" is missing "${relativePath}".`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
};

const REQUIRED_PROFILE_FIELDS = [
  "id",
  "brand.name",
  "currency.rounding",
  "catalog.files.products",
] as const;

const missingField = (value: unknown, field: string) => {
  let current: unknown = value;
  for (const part of field.split(".")) {
    if (typeof current !== "object" || current === null) return true;
    current = (current as Record<string, unknown>)[part];
  }
  return current === undefined || current === null || current === "";
};

/**
 * Reads and shallowly checks `profile.json`. The full contract is enforced by
 * `scripts/validate-store-profile.mjs` (Ajv, strict); the seed only asserts the
 * handful of fields it dereferences, so a broken profile fails with a sentence
 * instead of a `TypeError`.
 */
export const loadProfile = (id: string, dir: string): StoreProfile => {
  const profile = readProfileJson<StoreProfile>(dir, "profile.json");

  for (const field of REQUIRED_PROFILE_FIELDS) {
    if (missingField(profile, field)) {
      throw new Error(`Store profile "${id}": profile.json is missing "${field}".`);
    }
  }

  if (profile.id !== id) {
    throw new Error(
      `Store profile "${id}": profile.json declares id "${profile.id}". The directory name and the id must match.`,
    );
  }

  return profile;
};

const buildContext = (
  env: NodeJS.ProcessEnv = process.env,
): StoreProfileContext | null => {
  const resolved = resolveProfileDir(env);
  if (!resolved) return null;

  return {
    id: resolved.id,
    dir: resolved.dir,
    profile: loadProfile(resolved.id, resolved.dir),
    mediaBaseUrl: (env.STORE_MEDIA_BASE_URL ?? "").trim(),
  };
};

let cached: StoreProfileContext | null | undefined;

/**
 * The active profile, read once per process. The seed data modules evaluate at
 * import time, so the environment is fixed by then; `resetStoreProfile()` exists
 * for tests that flip the environment between cases.
 */
export const getStoreProfile = (): StoreProfileContext | null => {
  if (cached === undefined) cached = buildContext();
  return cached;
};

export const resetStoreProfile = () => {
  cached = undefined;
};

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const MEDIA_REF = /^media\/[a-z0-9][a-z0-9-]*\.(?:webp|png|jpg)$/;

/**
 * Turns a profile image ref (`media/<file>`) into the URL the seed stores.
 *
 * An absolute URL in a profile is a hard error: profile media is re-hosted by us
 * (rule 17d) and a provider URL that slips into the catalog would rot silently.
 */
export const toMediaUrl = (ref: string, baseUrl: string): string => {
  if (ABSOLUTE_URL.test(ref)) {
    throw new Error(
      `Profile image "${ref}" is an absolute URL. Profile images must be re-hosted and referenced as "media/<file>.webp"; the seed prefixes STORE_MEDIA_BASE_URL.`,
    );
  }

  if (!MEDIA_REF.test(ref)) {
    throw new Error(
      `Profile image "${ref}" is not a media ref. Expected "media/<file>.(webp|png|jpg)".`,
    );
  }

  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      `STORE_MEDIA_BASE_URL is not set, so profile image "${ref}" has no URL. Set it to the directory the profile media is served from, e.g. http://localhost:9000/static/store-profiles/<id>.`,
    );
  }

  return `${base}/${ref.slice("media/".length)}`;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Recursive merge used for translations: the override wins key by key, arrays
 * and scalars replace wholesale, and a key the override omits keeps the base
 * value. That is what lets a profile translate its own products while the base
 * keeps carrying `refundReasons`, `shippingOptions` and friends.
 */
export const deepMerge = <T>(base: T, override: unknown): T => {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T;

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = deepMerge(merged[key], value);
  }
  return merged as T;
};
