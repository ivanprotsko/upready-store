import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Acceptance-only fixture (w21-wb-write-stocks-prices): gives the first few
 * WB-linked variants of the Cherkashina stand a counted stock, so the stocks
 * diff has `update` and `equal` rows to show and not only `skipped` ones.
 *
 * Why it is needed at all: every variant of the migrated catalog carries
 * `manage_inventory: false` and has no inventory item, which the diff reports
 * honestly as `store_does_not_count_this_variant` — the right answer, and a
 * poor demonstration. This fixture makes the stand look like a shop that DOES
 * count its stock.
 *
 * Scratch database only, never a live host. Quantities are chosen against the
 * WB mirror on purpose: one variant is given exactly what WB already holds
 * (so the diff says `equal`) and the rest are given something else.
 *
 *   npx medusa exec ./scripts/fixtures/w21-seed-stand-stock.ts
 */
export default async function seedStandStock({ container }: { container: MedusaContainer }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);

  const locationId = process.env.W21_LOCATION_ID ?? "sloc_01M29Q4KK69EGJ3R9EQFEF399J";
  const tenantId = process.env.W21_TENANT_ID ?? "ten_01M29Q4KYQHC70JZBENWZ8Z88M";
  const warehouseId = process.env.W21_WAREHOUSE_ID ?? "985793";
  const howMany = Number(process.env.W21_COUNT ?? 6);

  const { data: links } = await query.graph({
    entity: "product_marketplace_link",
    fields: ["product_id", "external_id"],
    filters: { tenant_id: tenantId, marketplace: "wb" },
    pagination: { take: null } as never,
  });

  const { data: cards } = await query.graph({
    entity: "wb_product",
    fields: ["nm_id", "sizes"],
    filters: { tenant_id: tenantId },
    pagination: { take: null } as never,
  });

  const { data: stocks } = await query.graph({
    entity: "wb_stock",
    fields: ["sku", "amount", "warehouse_id"],
    filters: { tenant_id: tenantId, warehouse_id: warehouseId },
    pagination: { take: null } as never,
  });

  const barcodeByNm = new Map<string, string>();
  for (const card of cards) {
    const sizes = Array.isArray(card.sizes) ? (card.sizes as Record<string, unknown>[]) : [];
    const skus = sizes.flatMap((size) => (Array.isArray(size?.skus) ? (size.skus as string[]) : []));
    if (skus.length === 1) {
      barcodeByNm.set(String(card.nm_id), String(skus[0]));
    }
  }

  const wbAmountByBarcode = new Map<string, number>();
  for (const stock of stocks) {
    wbAmountByBarcode.set(String(stock.sku), Number(stock.amount ?? 0));
  }

  const chosen = links.slice(0, howMany);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.sku"],
    filters: { id: chosen.map((row) => String(row.product_id)) },
    pagination: { take: null } as never,
  });

  const byProduct = new Map(products.map((product) => [String(product.id), product]));

  let index = 0;
  for (const row of chosen) {
    const product = byProduct.get(String(row.product_id));
    const variant = ((product?.variants ?? []) as Record<string, unknown>[])[0];
    if (!variant?.id) {
      console.log(`w21-seed-stand-stock: ${row.product_id} has no variant — skipped.`);
      continue;
    }

    const barcode = barcodeByNm.get(String(row.external_id)) ?? null;
    const wbAmount = barcode ? (wbAmountByBarcode.get(barcode) ?? 0) : 0;
    // The first one matches WB exactly, so the diff has an `equal` row too.
    const quantity = index === 0 ? wbAmount : wbAmount + 5 + index;
    index += 1;

    const { result: items } = await createInventoryItemsWorkflow(container).run({
      input: { items: [{ sku: `w21-${variant.sku ?? variant.id}`, title: String(product?.title ?? "") }] },
    });
    const inventoryItemId = String(items[0].id);

    await link.create({
      [Modules.PRODUCT]: { variant_id: String(variant.id) },
      [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
    });

    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: [
          { inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: quantity },
        ],
      },
    });

    await updateProductVariantsWorkflow(container).run({
      input: { selector: { id: String(variant.id) }, update: { manage_inventory: true } },
    });

    console.log(
      `w21-seed-stand-stock: ${variant.sku ?? variant.id} nmID ${row.external_id} ` +
        `barcode ${barcode ?? "-"} store ${quantity} vs WB ${wbAmount}`,
    );
  }
}
