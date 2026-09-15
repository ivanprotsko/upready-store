import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";

export default async function probe({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "weight",
      "metadata",
      "images.url",
      "images.rank",
      "categories.id",
      "categories.name",
      "categories.parent_category_id",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.weight",
      "variants.manage_inventory",
      "variants.price_set.prices.*",
      "variants.price_set.prices.price_rules.*",
      "variants.inventory_items.inventory_item_id",
    ],
    pagination: { take: 2 },
  });
  console.log("T14PROBE " + JSON.stringify(data, null, 1).slice(0, 4000));
}
