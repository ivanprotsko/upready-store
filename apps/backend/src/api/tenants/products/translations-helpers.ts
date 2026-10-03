import type { MedusaContainer } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

/**
 * t-cherk-37: the product's own translations, stored in Medusa's core
 * Translation module (`Modules.TRANSLATION`) under the SAME reference names
 * the migration seed already writes (`migration-scripts/lib/translations.ts`):
 * `product` (title, subtitle, description), `product_option` (title),
 * `product_variant` (title). No new module and no new migration — the storage
 * already exists, and `MEDUSA_FF_TRANSLATION` is what makes the Store API and
 * the cart apply it (`docs/translations.md`).
 *
 * Reusing the core module rather than a bespoke one also means the existing
 * `translation.created/updated/deleted` subscriber
 * (`src/subscribers/product-updated.ts`) and the storefront's `translation.*`
 * cache clearing (`apps/storefront/src/app/api/revalidate/clearings.ts`)
 * already fire on every write here, with no new wiring.
 */

export const PRODUCT_REFERENCE = "product";
export const PRODUCT_OPTION_REFERENCE = "product_option";
export const PRODUCT_VARIANT_REFERENCE = "product_variant";

export const PRODUCT_TRANSLATION_FIELDS = ["title", "subtitle", "description"] as const;
export type ProductTranslationField = (typeof PRODUCT_TRANSLATION_FIELDS)[number];

type TranslationRow = {
  id: string;
  reference: string;
  reference_id: string;
  locale_code: string;
  translations: Record<string, unknown>;
};

type TranslationService = {
  listTranslations: (filters: Record<string, unknown>) => Promise<TranslationRow[]>;
  createTranslations: (data: unknown) => Promise<unknown>;
  updateTranslations: (data: unknown) => Promise<unknown>;
  listLocales: (filters: Record<string, unknown>) => Promise<{ code: string }[]>;
  createLocales: (data: { code: string; name: string }[]) => Promise<unknown>;
};

export const translationService = (container: MedusaContainer): TranslationService =>
  container.resolve(Modules.TRANSLATION) as unknown as TranslationService;

/**
 * Every translation row for the given reference ids, across every locale:
 * `{ [reference_id]: { [locale_code]: { [field]: text } } }`. One query
 * regardless of how many ids: `listTranslations` takes an array `reference_id`
 * filter, and an empty one is INTENTIONALLY skipped — handed to the module it
 * would mean "no filter", i.e. every translation in the database.
 */
export const readTranslationsByLocale = async (
  container: MedusaContainer,
  referenceIds: string[],
): Promise<Map<string, Map<string, Record<string, unknown>>>> => {
  const byId = new Map<string, Map<string, Record<string, unknown>>>();

  if (!referenceIds.length) {
    return byId;
  }

  const rows = await translationService(container).listTranslations({
    reference_id: referenceIds,
  });

  for (const row of rows) {
    const byLocale = byId.get(row.reference_id) ?? new Map();
    byLocale.set(row.locale_code, row.translations ?? {});
    byId.set(row.reference_id, byLocale);
  }

  return byId;
};

const nonEmpty = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * Upserts ONE locale's fields on ONE entity, merging into whatever that
 * locale's row already carries rather than replacing it whole: the panel's
 * «Переводы» screen edits one language at a time
 * (`PUT /tenants/products/:id/translations`), and a save of the title must not
 * discard a subtitle saved a minute earlier in the same locale.
 *
 * A field submitted as `undefined` is left untouched (the owner's form may
 * send only the fields it rendered); a field submitted as `""` CLEARS it —
 * dropped from the JSON rather than stored as an empty string, which is what
 * lets the storefront's fallback-to-original logic (`applyTranslations`,
 * `typeof object[key] === typeof translation[key]` and non-empty) treat a
 * cleared field exactly like one never translated.
 *
 * Creates the locale row (`translation_locale`) the first time the shop
 * writes in it, the same one-time cost `writeTranslations`
 * (`product-attributes/helpers.ts`) pays.
 */
export const upsertTranslationFields = async (
  container: MedusaContainer,
  reference: string,
  referenceId: string,
  localeCode: string,
  fields: Record<string, string | undefined>,
): Promise<void> => {
  const submitted = Object.entries(fields).filter(([, value]) => value !== undefined);

  if (!submitted.length) {
    return;
  }

  const service = translationService(container);

  const knownLocales = await service.listLocales({ code: [localeCode] });
  if (!knownLocales.length) {
    await service.createLocales([{ code: localeCode, name: localeCode }]);
  }

  const [existing] = await service.listTranslations({
    reference,
    reference_id: [referenceId],
    locale_code: localeCode,
  });

  const merged: Record<string, unknown> = { ...(existing?.translations ?? {}) };
  for (const [field, value] of submitted) {
    if (nonEmpty(value)) {
      merged[field] = value.trim();
    } else {
      delete merged[field];
    }
  }

  if (existing) {
    await service.updateTranslations({ id: existing.id, translations: merged });
    return;
  }

  if (Object.keys(merged).length) {
    await service.createTranslations({
      reference,
      reference_id: referenceId,
      locale_code: localeCode,
      translations: merged,
    });
  }
};
