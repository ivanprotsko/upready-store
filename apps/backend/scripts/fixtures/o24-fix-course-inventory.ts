import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * o24-courses part (e): `o24-seed-courses.ts` created its course products
 * BEFORE it set `manage_inventory: false` on their variants (fixed in the
 * same commit as this script). Any environment that already ran the old
 * version — `upready_store_e2e` did, during courses-1 — is stuck with course
 * variants that read "Нет в наличии" and never allow an add-to-cart, since no
 * stock level was ever seeded for them. This is the one-off correction for
 * data seeded by the old script; `o24-seed-courses.ts` itself is already
 * fixed for anyone seeding from scratch from now on.
 *
 * Idempotent: matches variants by `product.metadata.digital = "true"` and
 * does nothing if all of them already have `manage_inventory: false`.
 */
export default async function fixO24CourseInventory({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "variants.id", "variants.manage_inventory"],
    filters: {},
  });

  const digitalVariantIds = products
    .filter((product) => (product.metadata as Record<string, unknown> | null)?.digital === "true")
    .flatMap((product) => (product.variants ?? []) as { id: string; manage_inventory: boolean }[])
    .filter((variant) => variant.manage_inventory)
    .map((variant) => variant.id);

  if (digitalVariantIds.length === 0) {
    logger.info("o24-fix-course-inventory: no digital-product variant still has manage_inventory=true, skipping");
    return;
  }

  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: digitalVariantIds.map((id) => ({ id, manage_inventory: false })),
    },
  });

  logger.info(`o24-fix-course-inventory: set manage_inventory=false on ${digitalVariantIds.length} variant(s)`);
}
