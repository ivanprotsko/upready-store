import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { SEED_LOCALES, SEED_TRANSLATIONS } from "../migration-scripts/data/i18n";
import { SEED_PRODUCTS, SEED_PRODUCT_OPTIONS } from "../migration-scripts/data/products";
import { optionTitleFor, optionValueFor } from "../migration-scripts/lib/translations";

/**
 * Re-derives the product option and option value translations of the ACTIVE profile
 * (`STORE_PROFILE`) from its i18n files and rewrites the rows that differ.
 *
 * The seed writes a translation once and skips every row that already exists, so a
 * database seeded before `productOptions` was read (`lib/translations.ts`) keeps
 * "Colourway" as its Russian option title for good. Measured on shipshift.dev
 * 2026-09-12: the `product_option` ru rows carried the English title while the profile
 * file said "Расцветка". Run once per profile on the shared engine, after the image
 * that carries this fix is up:
 *
 *   docker exec -e STORE_PROFILE=sneakers mt-backend \
 *     node_modules/.bin/medusa exec ./src/scripts/backfill-option-translations.js
 *
 * Reads and updates only; creates a row where none exists; deletes nothing. The
 * option discovery is the seed's own (declared titles plus the per-product "Default
 * option" rows reached through this profile's products), so a neighbour profile's
 * rows are never touched.
 */
export default async function backfillOptionTranslations({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const translationModuleService = container.resolve(Modules.TRANSLATION);
  const profile = process.env.STORE_PROFILE ?? "(default catalog)";

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: ["id", "options.id"],
    filters: { handle: SEED_PRODUCTS.map((product) => product.handle) },
  });

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

  if (!ownOptionIds.size) {
    logger.warn(
      `backfill-option-translations: profile "${profile}" has no seeded option in this database, nothing to rewrite.`,
    );
    return;
  }

  const { data: options } = await query.graph({
    entity: "product_option",
    fields: ["id", "title", "values.id", "values.value"],
    filters: { id: Array.from(ownOptionIds) },
  });

  type Desired = {
    reference: string;
    reference_id: string;
    locale_code: string;
    translations: Record<string, string>;
  };
  const desired: Desired[] = [];

  for (const option of options) {
    for (const locale of SEED_LOCALES) {
      const t = SEED_TRANSLATIONS[locale];
      desired.push({
        reference: "product_option",
        reference_id: option.id,
        locale_code: locale,
        translations: { title: optionTitleFor(option.title, t) },
      });
      for (const value of option.values ?? []) {
        desired.push({
          reference: "product_option_value",
          reference_id: value.id,
          locale_code: locale,
          translations: { value: optionValueFor(option.title, value.value, t) },
        });
      }
    }
  }

  const existing = await translationModuleService.listTranslations({
    reference_id: Array.from(new Set(desired.map((row) => row.reference_id))),
  });
  const rowKey = (referenceId: string, localeCode: string) => `${referenceId}|${localeCode}`;
  const byKey = new Map(existing.map((row) => [rowKey(row.reference_id, row.locale_code), row]));

  let updated = 0;
  let created = 0;
  let unchanged = 0;

  for (const row of desired) {
    const current = byKey.get(rowKey(row.reference_id, row.locale_code));

    if (!current) {
      await translationModuleService.createTranslations(row);
      created += 1;
      continue;
    }

    const stored = (current.translations ?? {}) as Record<string, unknown>;
    const [field] = Object.keys(row.translations);

    if (stored[field] === row.translations[field]) {
      unchanged += 1;
      continue;
    }

    await translationModuleService.updateTranslations({
      id: current.id,
      translations: { ...stored, ...row.translations },
    });
    updated += 1;
  }

  logger.info(
    `backfill-option-translations: profile "${profile}", ${options.length} options x ${SEED_LOCALES.length} locales: ${updated} rows rewritten, ${created} created, ${unchanged} already right.`,
  );
}
