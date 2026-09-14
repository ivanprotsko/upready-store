import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";
import { getTenantWarehouse, listTenantMethods } from "../helpers";
import type { PostTenantShippingMethodsReorderBody } from "../validators";

/**
 * `POST /tenants/shipping-methods/reorder` — the order the checkout lists the
 * methods in. Writes `data.sort_order` = position for every id; an id outside
 * the shop's zones fails the whole call with a 404 before anything is written.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantShippingMethodsReorderBody>,
  res: MedusaResponse,
) => {
  const warehouse = await getTenantWarehouse(req);
  const methods = await listTenantMethods(req, warehouse);
  const byId = new Map(methods.map((method) => [method.id, method]));

  const foreign = req.validatedBody.ids.find((id) => !byId.has(id));
  if (foreign) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shipping option with id: ${foreign} was not found`);
  }

  const updates = req.validatedBody.ids.map((id, index) => {
    const method = byId.get(id)!;
    const data: TenantMethodData = {
      schema: TENANT_METHOD_SCHEMA,
      tariff: method.tariff,
      description: method.description,
      delivery_hint: method.delivery_hint,
      sort_order: index,
      default_weight_g: warehouse.default_weight_g,
      own_zone: method.own_zone,
      zone: method.zone,
    };
    return { id, data };
  });

  await updateShippingOptionsWorkflow(req.scope).run({ input: updates });

  res.json({ methods: await listTenantMethods(req, warehouse) });
};
