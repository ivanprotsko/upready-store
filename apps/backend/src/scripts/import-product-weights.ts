import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
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
 *   3. with `FROM_TITLE=1` only: the title's own «125 гр». A title says what is
 *      INSIDE the package, so this is opt-in and reported as its own group.
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
    fields: ["id", "handle", "name", "products.id", "products.title", "products.weight", "products.metadata"],
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

  type ProductRow = { id: string; title: string; weight: number | null; metadata: unknown };

  for (const tenant of chosen) {
    const products = ((tenant.products ?? []) as (ProductRow | null)[]).filter(
      (product): product is ProductRow => product !== null,
    );
    if (!products.length) {
      continue;
    }

    const found: { id: string; title: string; weight_g: number; source: string; evidence: string | null }[] = [];
    const already: string[] = [];
    const missing: string[] = [];

    for (const product of products) {
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
        (apply ? "" : " (пробный прогон, APPLY=1 чтобы записать)"),
    );
    for (const item of found) {
      logger.info(`  ${item.title} → ${item.weight_g} г (${item.source}: ${item.evidence ?? "—"})`);
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

    if (!apply || !found.length) {
      continue;
    }

    for (const item of found) {
      await updateProductsWorkflow(container).run({
        input: { selector: { id: item.id }, update: { weight: item.weight_g } as never },
      });
    }
    logger.info(`[${tenant.handle}] записан вес у ${found.length} товаров.`);
  }
}
