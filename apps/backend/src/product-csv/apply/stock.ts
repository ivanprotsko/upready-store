import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  batchInventoryItemLevelsWorkflow,
  batchLinksWorkflow,
  createInventoryItemsWorkflow,
} from "@medusajs/medusa/core-flows";
import { buildBatchVariantInventoryData } from "@medusajs/medusa/api/admin/products/helpers";
import { normalizeHeader } from "../columns";

/**
 * The stock levels of an import.
 *
 * `../apply.ts` runs these steps and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/**
 * Stocked quantities at the shop's own warehouse. A level that exists is
 * updated, one that does not is created; a shop with no warehouse gets nothing
 * written and the plan already said so on the row.
 */
export const writeStock = async ({
  container,
  productId,
  locationId,
  wanted,
}: {
  container: MedusaContainer;
  productId: string;
  locationId: string | null;
  wanted: { sku: string | null; title: string | null; stock: number }[];
}): Promise<string[]> => {
  const problems: string[] = [];

  if (wanted.length === 0) {
    return problems;
  }

  if (!locationId) {
    problems.push("Остаток записать некуда: у магазина нет склада.");
    return problems;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "title", "inventory_items.inventory_item_id"],
    filters: { product_id: [productId] },
  });

  const variantFor = (entry: { sku: string | null; title: string | null }) =>
    variants.find((variant) => {
      if (entry.sku) {
        return normalizeHeader(String(variant?.sku ?? "")) === normalizeHeader(entry.sku);
      }
      if (entry.title) {
        return normalizeHeader(String(variant?.title ?? "")) === normalizeHeader(entry.title);
      }
      return true;
    });

  const itemOf = (variant: Record<string, unknown> | undefined): string | null =>
    ((variant?.inventory_items ?? []) as { inventory_item_id?: string | null }[])
      .map((link) => link?.inventory_item_id)
      .find((id): id is string => Boolean(id)) ?? null;

  const targets: { item: string; stock: number }[] = [];

  for (const entry of wanted) {
    const variant = variantFor(entry);

    if (!variant?.id) {
      problems.push(
        `Остаток ${entry.stock} записать некуда: варианта ${entry.sku ? `с SKU «${entry.sku}»` : `«${entry.title ?? ""}»`} у товара уже нет.`,
      );
      continue;
    }

    const existingItem = itemOf(variant);

    if (existingItem) {
      targets.push({ item: existingItem, stock: entry.stock });
      continue;
    }

    // A variant that was not stock-managed has NO inventory item, and turning
    // `manage_inventory` on does not create one: `updateProductVariantsWorkflow`
    // only ever DISMISSES inventory (`dismissProductVariantsInventoryStep`),
    // items are created at variant-creation time. So a stock number on a
    // previously unmanaged variant needs the item and the link made here, the
    // way the Admin's inventory kit makes them — measured on the stand
    // 2026-09-15: without this the report said «Остаток "" → 77» and the
    // database kept no level at all (rule 20a: a write nobody made must not
    // read as a write).
    const { result: created } = await createInventoryItemsWorkflow(container).run({
      input: {
        items: [
          {
            sku: (variant.sku as string | null) ?? undefined,
            title: (variant.title as string | null) ?? undefined,
          },
        ],
      },
    });

    const itemId = created[0]?.id;

    if (!itemId) {
      problems.push(`Остаток ${entry.stock} не записан: не удалось создать складскую позицию.`);
      continue;
    }

    await batchLinksWorkflow(container).run({
      input: {
        create: buildBatchVariantInventoryData([
          {
            variant_id: String(variant.id),
            inventory_item_id: itemId,
            required_quantity: 1,
          },
        ]),
      },
    });

    targets.push({ item: itemId, stock: entry.stock });
  }


  if (targets.length === 0) {
    return problems;
  }

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id"],
    filters: {
      inventory_item_id: targets.map((entry) => entry.item),
      location_id: [locationId],
    },
  });

  const existing = new Set(
    levels.map((level) => String(level?.inventory_item_id ?? "")).filter(Boolean),
  );

  const create = targets
    .filter((entry) => !existing.has(entry.item))
    .map((entry) => ({
      inventory_item_id: entry.item,
      location_id: locationId,
      stocked_quantity: entry.stock,
    }));

  const update = targets
    .filter((entry) => existing.has(entry.item))
    .map((entry) => ({
      inventory_item_id: entry.item,
      location_id: locationId,
      stocked_quantity: entry.stock,
    }));

  await batchInventoryItemLevelsWorkflow(container).run({
    input: { create, update, delete: [] } as never,
  });

  return problems;
};
