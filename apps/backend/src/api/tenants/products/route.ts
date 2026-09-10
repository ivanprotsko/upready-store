import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import createTenantProductWorkflow from "../../../workflows/tenant/create-tenant-product";

/**
 * `POST /tenants/products` — creates a product in the tenant's own sales
 * channel and records the tenant as its owner. Body: the Admin's
 * `AdminCreateProduct` shape; `sales_channels` in it are ignored in favour of
 * the tenant's channel.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateProduct>,
  res: MedusaResponse,
) => {
  const { result } = await createTenantProductWorkflow(req.scope).run({
    input: {
      tenant_admin_id: req.auth_context.actor_id,
      product: req.validatedBody,
    },
  });

  res.status(201).json({
    product: result.product,
  });
};

/**
 * `GET /tenants/products` — the products linked to the tenant, nothing else.
 * Scoped through the tenant-product link, so a product the tenant has never
 * created is invisible here even when it sits in the same database.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["tenant.id", "tenant.products.*", "tenant.products.variants.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  res.json({
    products: tenantAdmin?.tenant?.products ?? [],
  });
};
