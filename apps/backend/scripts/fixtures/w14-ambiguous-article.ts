import type { MedusaContainer } from "@medusajs/framework";
import type { IProductModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Acceptance-only fixture (w14-mp-catalog-link): makes the matcher's THIRD
 * outcome — «требует выбора» — reachable on a scratch stand.
 *
 * WHY IT IS NEEDED AT ALL. `product_variant.sku` carries a unique index over
 * live rows (`IDX_product_variant_sku_unique`, measured on this stand), so two
 * variants cannot hold the SAME article and the ambiguous branch looks
 * unreachable. It is not: the index is case-SENSITIVE and the matcher folds
 * case (`link.ts`), so «Сбитень» and «сбитень» are two legal rows of one
 * article — a state a real catalog reaches by itself the day someone types an
 * article in lower case.
 *
 * This fixture renames ONE existing variant to the case-folded twin of another
 * variant's SKU, and puts the old SKU back on demand. Scratch database only.
 *
 *   W14_TWIN_OF=Сбитень W14_VARIANT_SKU=HOODIE-M \
 *     npx medusa exec ./scripts/fixtures/w14-ambiguous-article.ts
 *   W14_UNDO=1 W14_VARIANT_ID=<id> W14_RESTORE_SKU=HOODIE-M \
 *     npx medusa exec ./scripts/fixtures/w14-ambiguous-article.ts
 */
export default async function ambiguousArticle({ container }: { container: MedusaContainer }) {
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT);

  if (process.env.W14_UNDO === "1") {
    const id = process.env.W14_VARIANT_ID as string;
    const sku = process.env.W14_RESTORE_SKU as string;
    await products.updateProductVariants(id, { sku });
    console.log(`w14-ambiguous-article: ${id} -> sku ${sku} (undo)`);
    return;
  }

  const twinOf = process.env.W14_TWIN_OF as string;
  const variantSku = process.env.W14_VARIANT_SKU as string;

  const [victim] = await products.listProductVariants({ sku: variantSku }, { take: 1 });
  if (!victim) {
    throw new Error(`w14-ambiguous-article: no variant with sku ${variantSku}`);
  }

  const twin = twinOf.toLowerCase();
  await products.updateProductVariants(victim.id, { sku: twin });

  console.log(
    `w14-ambiguous-article: ${victim.id} (${variantSku}) -> sku "${twin}", ` +
      `twin of "${twinOf}". Undo: W14_UNDO=1 W14_VARIANT_ID=${victim.id} ` +
      `W14_RESTORE_SKU=${variantSku}`,
  );
}
