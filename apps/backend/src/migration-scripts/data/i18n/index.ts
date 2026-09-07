import fs from "node:fs";
import path from "node:path";
import { readJsonDir } from "../read-json-dir";
import { deepMerge, getStoreProfile } from "../store-profile";

export type ProductText = { title: string; description: string };
export type LabelText = { label: string; description: string };

export type SeedTranslations = {
  terms: Record<string, string>;
  categories: Record<string, string>;
  products: Record<string, ProductText>;
  collections: Record<string, string>;
  shippingOptions: Record<string, string>;
  shippingTypes: Record<string, LabelText>;
  refundReasons: Record<string, LabelText>;
};

export type SeedLocale = string;

export type SeedLocaleFile = {
  name: string;
  translations: SeedTranslations;
};

export type ProfileLocaleFile = {
  name?: string;
  translations?: Partial<SeedTranslations>;
};

const TRANSLATION_GROUPS = [
  "terms",
  "categories",
  "products",
  "collections",
  "shippingOptions",
  "shippingTypes",
  "refundReasons",
] as const;

const emptyTranslations = (): SeedTranslations =>
  Object.fromEntries(
    TRANSLATION_GROUPS.map((group) => [group, {}]),
  ) as unknown as SeedTranslations;

/**
 * A profile locale file is the seed's own shape, partial. Files that carry the
 * translation groups at the top level (no `translations` wrapper) are accepted
 * as the same thing — there is no schema for these files, and both readings are
 * unambiguous. Anything else fails loudly.
 */
export const normalizeProfileLocaleFile = (
  code: string,
  data: unknown,
): ProfileLocaleFile => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Profile locale file "${code}.json" is not an object.`);
  }

  const record = data as Record<string, unknown>;
  if (record.translations !== undefined) {
    return record as ProfileLocaleFile;
  }

  const groups = Object.fromEntries(
    TRANSLATION_GROUPS.filter((group) => record[group] !== undefined).map(
      (group) => [group, record[group]],
    ),
  );

  if (!Object.keys(groups).length) {
    throw new Error(
      `Profile locale file "${code}.json" carries no translations. Expected a "translations" object, or the groups (${TRANSLATION_GROUPS.join(", ")}) at the top level.`,
    );
  }

  return {
    name: typeof record.name === "string" ? record.name : undefined,
    translations: groups as Partial<SeedTranslations>,
  };
};

const readProfileLocales = (dir: string) => {
  if (!fs.existsSync(dir)) return new Map<string, ProfileLocaleFile>();

  return new Map(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => {
        const code = path.basename(file, ".json");
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        return [code, normalizeProfileLocaleFile(code, data)] as const;
      }),
  );
};

const baseLocales = readJsonDir<SeedLocaleFile>(path.join(__dirname, "json"), {
  label: "locale files",
  requiredFields: [
    "name",
    "translations.terms",
    "translations.categories",
    "translations.products",
    "translations.collections",
    "translations.shippingOptions",
    "translations.shippingTypes",
    "translations.refundReasons",
  ],
}).map((entry) => ({ code: entry.name, ...entry.data }));

/**
 * Merges a profile's catalog translations over the base seed's locale files.
 *
 * Profile keys win; every key the profile does not carry — `refundReasons`,
 * `shipping*`, terms — comes from the base, so a locale the profile never
 * translated still reaches the storefront complete.
 */
export const mergeLocales = (
  base: { code: string; name: string; translations: SeedTranslations }[],
  overrides: Map<string, ProfileLocaleFile>,
) => {
  const baseByCode = new Map(base.map((locale) => [locale.code, locale]));
  const codes = [...new Set([...baseByCode.keys(), ...overrides.keys()])];

  return codes.map((code) => {
    const baseLocale = baseByCode.get(code);
    const override = overrides.get(code);
    const name = override?.name ?? baseLocale?.name;

    if (!name) {
      throw new Error(
        `Locale "${code}" is only defined by the profile and its file has no "name". Add the locale's display name, or translate an existing locale.`,
      );
    }

    return {
      code,
      name,
      translations: deepMerge(
        baseLocale?.translations ?? emptyTranslations(),
        override?.translations,
      ),
    };
  });
};

const profile = getStoreProfile();
const locales = profile
  ? mergeLocales(baseLocales, readProfileLocales(path.join(profile.dir, "i18n")))
  : baseLocales;

export const SEED_LOCALES: SeedLocale[] = locales.map((locale) => locale.code);

export const SEED_LOCALE_NAMES: Record<SeedLocale, string> = Object.fromEntries(
  locales.map((locale) => [locale.code, locale.name]),
);

export const SEED_TRANSLATIONS: Record<SeedLocale, SeedTranslations> =
  Object.fromEntries(
    locales.map((locale) => [locale.code, locale.translations]),
  );
