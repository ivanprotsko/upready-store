import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { weightFromMetadata, weightFromTitle } from "../shipping-tariffs/weight-from-metadata";

/**
 * Fills `product.weight` (grams) from the metadata a catalog import left on the
 * card, so a «price per kilogram» tariff prices a real parcel instead of
 * falling back to the shop's default weight for every line.
 *
 * Where the number comes from, in this order (`weight-from-metadata.ts`):
 *   1. `metadata.full_characteristics` / `short_characteristics` — the rows a
 *      marketplace import wrote («Вес товара, г»: 30, «Вес (с упаковкой)»: «70 г»).
 *   2. a plain `metadata.weight` / `weight_g` / `вес` key.
 *   3. with `FROM_TITLE=1` only: the title's own «125 гр», product and VARIANT
 *      alike («Сеннол 125 гр» is the variant, «Сеннол» the product). A title
 *      says what is INSIDE the package, not what the parcel weighs, so this is
 *      opt-in and reported as its own group. A variant weight is written on the
 *      variant, which is the first thing the checkout reads (`quoteTariff`).
 *
 * Reads only, unless `APPLY=1`. Products that already carry a weight are left
 * alone unless `OVERWRITE=1`; the run is idempotent either way.
 *
 *   TENANT=cherkashino npx medusa exec ./src/scripts/import-product-weights.ts
 *   TENANT=cherkashino APPLY=1 npx medusa exec ./src/scripts/import-product-weights.ts
 *   TENANT=cherkashino APPLY=1 FROM_TITLE=1 npx medusa exec ./src/scripts/import-product-weights.ts
 */
export default async function importProductWeights({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const only = (process.env.TENANT ?? "").trim().toLowerCase();
  const apply = process.env.APPLY === "1";
  const fromTitle = process.env.FROM_TITLE === "1";
  const overwrite = process.env.OVERWRITE === "1";

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "handle",
      "name",
      "products.id",
      "products.title",
      "products.weight",
      "products.metadata",
      "products.variants.id",
      "products.variants.title",
      "products.variants.weight",
    ],
  });

  const chosen = only
    ? tenants.filter(
        (tenant) =>
          String(tenant.handle ?? "").toLowerCase() === only || String(tenant.id ?? "").toLowerCase() === only,
      )
    : tenants;

  if (only && !chosen.length) {
    logger.error(`No shop with handle or id "${only}".`);
    return;
  }

  type VariantRow = { id: string; title: string; weight: number | null };
  type ProductRow = {
    id: string;
    title: string;
    weight: number | null;
    metadata: unknown;
    variants?: (VariantRow | null)[] | null;
  };

  for (const tenant of chosen) {
    const products = ((tenant.products ?? []) as (ProductRow | null)[]).filter(
      (product): product is ProductRow => product !== null,
    );
    if (!products.length) {
      continue;
    }

    const found: { id: string; title: string; weight_g: number; source: string; evidence: string | null }[] = [];
    const fromVariantTitle: { id: string; title: string; weight_g: number; evidence: string | null }[] = [];
    const already: string[] = [];
    const missing: string[] = [];

    for (const product of products) {
      // A variant carries the pack («Сеннол 125 гр») where the product carries
      // only the name, and the checkout reads the variant's weight first.
      if (fromTitle) {
        for (const variant of (product.variants ?? []).filter((row): row is VariantRow => row !== null)) {
          if (variant.weight && !overwrite) {
            continue;
          }
          const reading = weightFromTitle(variant.title);
          if (reading.weight_g !== null) {
            fromVariantTitle.push({
              id: variant.id,
              title: `${product.title} · ${variant.title}`,
              weight_g: reading.weight_g,
              evidence: reading.evidence,
            });
          }
        }
      }
      if (product.weight && !overwrite) {
        already.push(product.title);
        continue;
      }
      const reading = weightFromMetadata(product.metadata, { title: product.title, fromTitle });
      if (reading.weight_g === null) {
        missing.push(product.title);
        continue;
      }
      found.push({
        id: product.id,
        title: product.title,
        weight_g: reading.weight_g,
        source: reading.source,
        evidence: reading.evidence,
      });
    }

    logger.info(
      `[${tenant.handle}] товаров ${products.length}: вес уже задан у ${already.length}, ` +
        `найден в метаданных у ${found.length}, не найден у ${missing.length}` +
        (fromTitle ? `, из названий вариантов ${fromVariantTitle.length}` : "") +
        (apply ? "" : " (пробный прогон, APPLY=1 чтобы записать)"),
    );
    for (const item of found) {
      logger.info(`  ${item.title} → ${item.weight_g} г (${item.source}: ${item.evidence ?? "—"})`);
    }
    for (const item of fromVariantTitle) {
      logger.info(`  ВАРИАНТ ${item.title} → ${item.weight_g} г (из названия: ${item.evidence ?? "—"})`);
    }
    for (const title of missing) {
      const fallback = weightFromTitle(title);
      logger.info(
        `  БЕЗ ВЕСА: ${title}` +
          (fallback.weight_g !== null && !fromTitle
            ? ` — в названии есть «${fallback.evidence}», запустите с FROM_TITLE=1, если это вес посылки`
            : ""),
      );
    }

    if (!apply || (!found.length && !fromVariantTitle.length)) {
      continue;
    }

    for (const item of found) {
      await updateProductsWorkflow(container).run({
        input: { selector: { id: item.id }, update: { weight: item.weight_g } as never },
      });
    }
    for (const item of fromVariantTitle) {
      await updateProductVariantsWorkflow(container).run({
        input: { selector: { id: item.id }, update: { weight: item.weight_g } as never },
      });
    }
    logger.info(
      `[${tenant.handle}] записан вес: товаров ${found.length}, вариантов ${fromVariantTitle.length}.`,
    );
  }
}
