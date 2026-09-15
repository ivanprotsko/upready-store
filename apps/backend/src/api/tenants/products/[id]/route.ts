import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { deleteProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { remapKeysForProduct } from "@medusajs/medusa/api/admin/products/helpers";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { assertOwnedProduct, getTenantScope } from "../../tenant-scope";
import { remapTenantProduct } from "../helpers";
import {
  assertHandleFree,
  getTenantEnabledLocales,
  recordSlugRedirect,
} from "../../redirect-helpers";

/**
 * `GET /tenants/products/:id` — one of the tenant's own products, in the
 * Admin's retrieve shape. A product another tenant owns answers 404, the same
 * as an id that does not exist: the response never confirms a foreign row.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedProduct(req, req.params.id);

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  });

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${req.params.id}" was not found`,
    );
  }

  res.status(200).json({ product: remapTenantProduct(product) });
};

/**
 * `POST /tenants/products/:id` — updates one of the tenant's own products.
 * Body is the Admin's `AdminUpdateProduct`; the response is the Admin's
 * retrieve shape, which is what the copied product-edit drawer reads back.
 *
 * `sales_channels` in the body is ignored and the tenant's own channel is
 * written instead, every time, the same rule `POST /tenants/products` follows
 * on create. `updateProductsWorkflow` replaces the channel list rather than
 * merging it, so writing the tenant's one channel is exactly the invariant
 * "a tenant's product lives in the tenant's channel and nowhere else": the
 * copied product-sales-channels drawer can be opened and saved without moving
 * the product anywhere. A tenant whose channel link is gone gets no
 * `sales_channels` key at all rather than an invented one.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdateProduct>,
  res: MedusaResponse,
) => {
  const id = req.params.id;

  await assertOwnedProduct(req, id);

  const tenant = await getTenantScope(req);
  const { additional_data, sales_channels: _ignored, ...update } = req.validatedBody as
    & HttpTypes.AdminUpdateProduct
    & { additional_data?: Record<string, unknown> };

  let previousHandle: string | null = null;

  if (update.handle) {
    await assertHandleFree(req, "product", update.handle, id);

    const before = await refetchEntity({
      entity: "product",
      idOrFilter: id,
      scope: req.scope,
      fields: ["handle"],
    });
    previousHandle = (before?.handle as string | undefined) ?? null;
  }

  const { result } = await updateProductsWorkflow(req.scope).run({
    input: {
      selector: { id },
      update: tenant.sales_channel_id
        ? { ...update, sales_channels: [{ id: tenant.sales_channel_id }] }
        : update,
      additional_data,
    },
  });

  if (previousHandle && update.handle && previousHandle !== update.handle) {
    const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
    const locales = await getTenantEnabledLocales(tenantModuleService, tenant.id);
    await recordSlugRedirect(
      tenantModuleService,
      tenant.id,
      "products",
      previousHandle,
      update.handle,
      locales,
    );
  }

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: result[0].id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  });

  res.status(200).json({ product: remapTenantProduct(product) });
};

/**
 * `DELETE /tenants/products/:id` — deletes one of the tenant's own products
 * through Medusa's `deleteProductsWorkflow`, which also removes the module
 * links pointing at it, the tenant-product link included. A foreign id is a
 * 404 and deletes nothing.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const id = req.params.id;

  await assertOwnedProduct(req, id);

  await deleteProductsWorkflow(req.scope).run({
    input: { ids: [id] },
  });

  res.status(200).json({
    id,
    object: "product",
    deleted: true,
  });
};
