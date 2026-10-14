import type { MedusaContainer } from "@medusajs/framework";
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { pricePayload } from "../../product-csv/apply";
import type { DatasetProduct } from "../dataset";
import type { ApplyOptions, SectionCounters, LiveProduct } from "./live";

/**
 * The titles and prices sections.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

/**
 * The product's title from the WB card, with the shop's own title kept.
 *
 * `metadata.title_before_wb` is written ONCE, on the first run that changes the
 * title, and never overwritten: a second run must not record the WB title as
 * «what the shop called it», which is what a blind write would do the moment
 * the card is renamed.
 */
export const applyTitle = async (
  container: MedusaContainer,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  const wanted = (entry.title ?? "").trim();

  if (!wanted) {
    counters.titles_absent += 1;
    return;
  }

  if (wanted === product.title) {
    counters.titles_unchanged += 1;
    return;
  }

  counters.titles_updated += 1;
  options.logger.info(
    `[enrich] ${product.handle}: заголовок «${product.title}» -> «${wanted}»`,
  );

  if (options.dryRun) {
    return;
  }

  const metadata = { ...(product.metadata ?? {}) };
  if (metadata.title_before_wb === undefined) {
    metadata.title_before_wb = product.title;
  }
  metadata.wb_nm_id = entry.nm_id;

  await updateProductsWorkflow(container).run({
    input: { selector: { id: product.id }, update: { title: wanted, metadata } },
  });

  product.title = wanted;
  product.metadata = metadata;
};

/**
 * The variant price in the currency the WB card quotes.
 *
 * The payload is built by `pricePayload`, the catalog's own answer to a trap
 * measured in t14: `updatePriceSets` deletes every unscoped price whose id is
 * absent from the update, so sending the one currency that changed wipes the
 * other hundred-odd a seeded stand carries. Region-scoped rows and rows
 * belonging to a price list are carried through untouched.
 */
export const applyPrice = async (
  container: MedusaContainer,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.price) {
    counters.prices_absent += 1;
    return;
  }

  const currency = entry.price.currency.toLowerCase();
  const variant =
    product.variants.find((candidate) => candidate.sku === entry.variant_sku) ??
    product.variants[0];

  if (!variant) {
    counters.prices_absent += 1;
    return;
  }

  const current = variant.price_rows.find(
    (row) => row.currency_code === currency && !row.has_rules && !row.in_price_list,
  );

  if (current && current.amount === entry.price.amount) {
    counters.prices_unchanged += 1;
    return;
  }

  counters.prices_updated += 1;
  options.logger.info(
    `[enrich] ${product.handle}: цена ${currency.toUpperCase()} ` +
      `${current ? current.amount : "нет"} -> ${entry.price.amount}`,
  );

  if (options.dryRun) {
    return;
  }

  await updateProductVariantsWorkflow(container).run({
    input: {
      selector: { id: variant.id },
      update: {
        prices: pricePayload(
          { price_rows: variant.price_rows } as never,
          { [currency]: entry.price.amount },
        ) as never,
      },
    },
  });

  if (current) {
    current.amount = entry.price.amount;
  }
};
