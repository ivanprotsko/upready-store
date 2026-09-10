import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntities } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { emptyPage, listTenantProductIds, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/inventory-items` — the inventory items behind the variants of
 * the tenant's own products, in the Admin's list shape. The panel's product
 * form calls it only when the inventory-kit toggle is on.
 *
 * Two hops, both through links the tenant already owns: the tenant-product
 * link says which products are the tenant's, and the variant-to-inventory-item
 * link says which items those products consume. An item shared with another
 * tenant's variant would be visible to both, which is the same thing Medusa's
 * own inventory sharing means; nothing here reveals an item no variant of the
 * tenant's uses.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedProductIds = await listTenantProductIds(req);

  if (ownedProductIds.length === 0) {
    res.json({ inventory_items: [], ...emptyPage(req) });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.inventory_item_id"],
    filters: { product_id: ownedProductIds },
  });

  const ownedItemIds = [
    ...new Set(
      variants
        .flatMap((variant) => variant?.inventory_items ?? [])
        .map((link) => link?.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const ids = scopeIdFilter(ownedItemIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ inventory_items: [], ...emptyPage(req) });
    return;
  }

  const { data: inventory_items, metadata } = await refetchEntities({
    entity: "inventory_item",
    idOrFilter: { ...req.filterableFields, id: ids },
    scope: req.scope,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  });

  res.json({
    inventory_items,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
