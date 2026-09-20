import type { MedusaContainer } from "@medusajs/framework";
import type { CreateTranslationDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createTranslationsWorkflow } from "@medusajs/medusa/core-flows";
import {
  SEED_LOCALES,
  SEED_LOCALE_NAMES,
  SEED_TRANSLATIONS,
  type SeedLocale,
  type SeedTranslations,
} from "../data/i18n";
import {
  SEED_CATEGORIES,
  SEED_COLLECTIONS,
  SEED_PRODUCTS,
  SEED_PRODUCT_OPTIONS,
} from "../data/products";
import { logger } from "@medusajs/framework/logger";
import type { SeedMode } from "./store";
import { getQuery, toKey } from "./utils";

/** Every category handle the active profile seeds, parents and children. */
/**
 * A profile's `productOptions` block names the option and each of its values in that
 * locale (`profiles/<id>/i18n/<locale>.json`). It was written for exactly this and
 * never read: every option title fell through to `terms`, so "Colourway" reached the
 * Russian catalog as "Colourway" while the file said «Расцветка» (measured on
 * shipshift.dev, 2026-09-12). Exported for `scripts/backfill-option-translations.ts`,
 * which rewrites the rows a seed before this fix left in English.
 */
export const translateTerm = (value: string, t: SeedTranslations) =>
  t.terms[toKey(value)] ?? value;

export const optionTitleFor = (title: string, t: SeedTranslations) =>
  t.productOptions?.[toKey(title)]?.title ?? translateTerm(title, t);

/** Value keys are matched case-insensitively: a hand-written "10000Mah" has to meet
 *  `toKey("10 000 mAh")` = "10000MAh" (electronics, measured 2026-09-12). */
const valueIn = (values: Record<string, string> | undefined, value: string) => {
  if (!values) return undefined;
  const key = toKey(value);
  if (values[key]) return values[key];
  const wanted = key.toLowerCase();
  const found = Object.keys(values).find((candidate) => candidate.toLowerCase() === wanted);
  return found ? values[found] : undefined;
};

export const optionValueFor = (title: string, value: string, t: SeedTranslations) =>
  valueIn(t.productOptions?.[toKey(title)]?.values, value) ?? translateTerm(value, t);

/** A variant title is its option values joined by " / "; each segment is looked up
 *  across every option of the profile, since the title does not say which one. */
export const variantSegmentFor = (segment: string, t: SeedTranslations) => {
  for (const option of Object.values(t.productOptions ?? {})) {
    const value = valueIn(option.values, segment);
    if (value) return value;
  }
  return translateTerm(segment, t);
};

const ownCategoryHandles = () =>
  SEED_CATEGORIES.flatMap((category) => [
    category.handle,
    ...(category.children ?? []).map((child) => child.handle),
  ]);

export const seedTranslations = async (
  container: MedusaContainer,
  mode: SeedMode = "full",
) => {
  const query = getQuery(container);
  const translationModuleService = container.resolve(Modules.TRANSLATION);

  // `locale.code` is unique, and a second profile in the same database shares
  // the locales the first one created. Only the codes this profile adds are new.
  const existingLocales = await translationModuleService.listLocales({});
  const existingLocaleCodes = new Set(
    existingLocales.map((locale) => locale.code),
  );
  const newLocaleCodes = SEED_LOCALES.filter(
    (code) => !existingLocaleCodes.has(code),
  );

  if (newLocaleCodes.length) {
    await translationModuleService.createLocales(
      newLocaleCodes.map((code) => ({ code, name: SEED_LOCALE_NAMES[code] })),
    );
  }

  const translations: CreateTranslationDTO[] = [];

  const clean = (fields: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fields).filter(
        ([, value]) => value != null && value !== "",
      ),
    );

  const addTranslations = (
    reference: string,
    referenceId: string,
    byLocale: Partial<Record<SeedLocale, Record<string, unknown>>>,
  ) => {
    for (const locale of SEED_LOCALES) {
      const fields = byLocale[locale];
      if (!fields) continue;
      const cleaned = clean(fields);
      if (Object.keys(cleaned).length) {
        translations.push({
          reference,
          reference_id: referenceId,
          locale_code: locale,
          translations: cleaned,
        });
      }
    }
  };

  const translationsFor = <T>(
    getFields: (t: SeedTranslations) => T,
  ): Partial<Record<SeedLocale, T>> =>
    Object.fromEntries(
      SEED_LOCALES.map((locale) => [
        locale,
        getFields(SEED_TRANSLATIONS[locale]),
      ]),
    );

  // Every graph read below is filtered to what THIS profile seeds. A translation
  // is unique on (reference_id, locale_code), so translating a neighbour's
  // category a second time is not a duplicate row — it is a failed seed.
  const { data: seededCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: ownCategoryHandles() },
  });

  for (const category of seededCategories) {
    addTranslations(
      "product_category",
      category.id,
      translationsFor((t) => ({
        name: t.categories[toKey(category.handle)],
      })),
    );
  }

  const { data: seededCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
    filters: { handle: SEED_COLLECTIONS.map((collection) => collection.handle) },
  });

  for (const productCollection of seededCollections) {
    addTranslations(
      "product_collection",
      productCollection.id,
      translationsFor((t) => ({
        title: t.collections[toKey(productCollection.handle)],
      })),
    );
  }

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "description",
      "options.id",
      "variants.id",
      "variants.title",
    ],
    filters: {
      handle: SEED_PRODUCTS.map((product) => product.handle),
    },
  });

  // The options a profile declares are global (`product_option.title` is unique
  // across the database); the ones Medusa mints for a product with no options
  // are per product and share the placeholder title (`DEFAULT_OPTION_TITLE`
  // in `lib/products.ts`) with every other profile's, so they are reached
  // through the products instead of by title.
  const ownOptionIds = new Set(
    seededProducts.flatMap((product) =>
      (product.options ?? []).map((option: { id: string }) => option.id),
    ),
  );

  if (SEED_PRODUCT_OPTIONS.length) {
    const { data: declaredOptions } = await query.graph({
      entity: "product_option",
      fields: ["id"],
      filters: { title: SEED_PRODUCT_OPTIONS.map((option) => option.title) },
    });
    for (const option of declaredOptions) ownOptionIds.add(option.id);
  }

  // An empty `filters.id` is not "nothing" to the query layer, it is "no filter":
  // it would hand back every option in the database, neighbours included.
  const { data: seededProductOptions } = ownOptionIds.size
    ? await query.graph({
        entity: "product_option",
        fields: ["id", "title", "values.id", "values.value"],
        filters: { id: Array.from(ownOptionIds) },
      })
    : { data: [] as { id: string; title: string; values?: { id: string; value: string }[] }[] };

  for (const option of seededProductOptions) {
    addTranslations(
      "product_option",
      option.id,
      translationsFor((t) => ({ title: optionTitleFor(option.title, t) })),
    );

    for (const optionValue of option.values ?? []) {
      addTranslations(
        "product_option_value",
        optionValue.id,
        translationsFor((t) => ({
          value: optionValueFor(option.title, optionValue.value, t),
        })),
      );
    }
  }

  for (const product of seededProducts) {
    addTranslations(
      "product",
      product.id,
      translationsFor((t) => t.products[toKey(product.handle)]),
    );

    for (const variant of product.variants ?? []) {
      const localizeTitle = (t: SeedTranslations) =>
        variant.title
          .split(" / ")
          .map((segment: string) => variantSegmentFor(segment, t))
          .join(" / ");
      addTranslations(
        "product_variant",
        variant.id,
        translationsFor((t) => ({ title: localizeTitle(t) })),
      );
    }
  }

  // Shipping options and refund reasons belong to the shared fulfillment data,
  // which an add-profile run does not seed and must not re-translate. The cost
  // of variant A is that a second profile cannot restate them in its own words.
  if (mode === "full") {
    const { data: seededShippingOptions } = await query.graph({
      entity: "shipping_option",
      fields: [
        "id",
        "name",
        "type.id",
        "type.code",
        "type.label",
        "type.description",
      ],
    });

    for (const shippingOption of seededShippingOptions) {
      const optionType = shippingOption.type;
      if (!optionType) continue;

      addTranslations(
        "shipping_option",
        shippingOption.id,
        translationsFor((t) => ({
          name: t.shippingOptions[toKey(optionType.code)],
        })),
      );

      addTranslations(
        "shipping_option_type",
        optionType.id,
        translationsFor((t) => t.shippingTypes[toKey(optionType.code)]),
      );
    }

    const { data: seededRefundReasons } = await query.graph({
      entity: "refund_reason",
      fields: ["id", "label", "description"],
    });

    for (const refundReason of seededRefundReasons) {
      addTranslations(
        "refund_reason",
        refundReason.id,
        translationsFor((t) => t.refundReasons[toKey(refundReason.label)]),
      );
    }
  }

  // A translation is unique on (reference_id, locale_code), so a row SHARED
  // with a profile that was seeded earlier is already translated and a second
  // attempt is not a duplicate — it aborts the run. That is what the shared
  // product options do: `Size` and `Colour` are one row for every profile that
  // declares them, and translating them again killed the home-goods seed after
  // its catalog was already committed (measured 2026-09-11, shipshift.dev).
  // Filtered here, on the triple itself, rather than per reference type: the
  // next shared row will be silently handled instead of crashing the seed.
  const existing = translations.length
    ? await translationModuleService.listTranslations({
        reference_id: Array.from(
          new Set(translations.map((translation) => translation.reference_id)),
        ),
      })
    : [];

  const seen = new Set(
    existing.map(
      (translation) =>
        `${translation.reference_id}\u0000${translation.locale_code}`,
    ),
  );

  const fresh = translations.filter(
    (translation) =>
      !seen.has(`${translation.reference_id}\u0000${translation.locale_code}`),
  );

  logger.info(
    `Prepared ${translations.length} translations; ${translations.length - fresh.length} already exist on rows shared with another profile, writing ${fresh.length}.`,
  );

  if (!fresh.length) return;

  await createTranslationsWorkflow(container).run({
    input: { translations: fresh },
  });
};
