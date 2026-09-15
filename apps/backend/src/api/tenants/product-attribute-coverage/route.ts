import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { listAttributeDtos } from "../product-attributes/attribute-dto";
import { getTenantScope, listTenantProductIds } from "../tenant-scope";

/**
 * How much of the catalog carries characteristics (b04-product-attributes):
 * the number the panel's product list shows above the table.
 *
 * The owner fills characteristics product by product, so the one question the
 * list has to answer is «how many are still empty». Without it the screen
 * shows forty rows that look identical and the work has no visible end.
 *
 * Scope is the tenant behind the token; products come from the tenant-product
 * link, the same ownership record `GET /tenants/products` pages over, so the
 * denominator here is the number of rows on that screen.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const productIds = await listTenantProductIds(req);

  const attributes = await listAttributeDtos(req.scope, scope.id);

  if (!productIds.length || !attributes.length) {
    res.json({
      products_total: productIds.length,
      products_filled: 0,
      attributes_total: attributes.length,
      per_attribute: {},
    });
    return;
  }

  const service: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const values = await service.listTenantProductAttributeValues({ product_id: productIds });

  const nameByAttribute = new Map(attributes.map((attribute) => [attribute.id, attribute.name]));
  const filled = new Set<string>();
  const perAttribute: Record<string, number> = {};

  for (const value of values) {
    filled.add(value.product_id);
    const name = nameByAttribute.get(value.attribute_id);
    if (name) {
      perAttribute[name] = (perAttribute[name] ?? 0) + 1;
    }
  }

  res.json({
    products_total: productIds.length,
    products_filled: filled.size,
    attributes_total: attributes.length,
    per_attribute: perAttribute,
  });
};
