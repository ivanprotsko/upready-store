import { z } from "@medusajs/framework/zod";

/**
 * `apps/storefront/src/i18n/config.ts` `locales`, hand-transcribed. Same reason
 * `THEME_PRESETS` is transcribed in `tenants/home/validators.ts`: `pnpm-workspace.yaml`
 * lists only `apps/**`, so there is no shared package the backend could import the
 * storefront's own list from.
 */
export const LOCALE_CODES = [
  "ar",
  "bg",
  "bn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ka",
  "ko",
  "lt",
  "mn",
  "ms",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tl",
  "tr",
  "uk",
  "vi",
  "zh",
] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

/** ISO 3166-1 alpha-2, lowercase — the shape `LOCALE_COUNTRY_MAP` values already take. */
const countryCodeSchema = z
  .string()
  .regex(/^[a-z]{2}$/, "default_country must be a two-letter country code.")
  .nullable();

export const PutTenantLocaleSettingsBody = z
  .object({
    default_locale: z.enum(LOCALE_CODES),
    enabled_locales: z
      .array(z.enum(LOCALE_CODES))
      .min(1, "enabled_locales must name at least one locale.")
      .refine((locales) => new Set(locales).size === locales.length, {
        message: "enabled_locales must not repeat a locale.",
      }),
    default_country: countryCodeSchema.optional().default(null),
  })
  .refine((body) => body.enabled_locales.includes(body.default_locale), {
    message: "enabled_locales must include default_locale.",
    path: ["enabled_locales"],
  });

export type PutTenantLocaleSettingsBodyType = z.infer<
  typeof PutTenantLocaleSettingsBody
>;

/**
 * The stored (and returned) document. `string`/`string[]` rather than
 * `LocaleCode`/`LocaleCode[]`: the generated `TenantLocaleSettings` service
 * methods type every `model.json()` field as `Record<string, unknown>` (an
 * array has no STRING index signature, so a `LocaleCode[]` is not assignable
 * to it), the same reason `tenant-home/validators.ts`'s `TenantHomeDocument`
 * is read back through an `as unknown as` cast rather than typed straight
 * through the service. The zod schema above is what actually enforces the
 * 36-code vocabulary on input.
 */
export type TenantLocaleSettingsDocument = {
  default_locale: string;
  enabled_locales: string[];
  default_country: string | null;
};
