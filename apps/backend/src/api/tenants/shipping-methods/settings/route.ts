import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { keptMethodData, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";
import { getTenantWarehouse, listTenantMethods, saveDefaultWeight } from "../helpers";
import type { PostTenantShippingSettingsBody } from "../validators";

/**
 * `GET|POST /tenants/shipping-methods/settings` — the shop's default item
 * weight in grams, used for a cart line whose variant has no weight. Stored on
 * the tenant (`metadata.shipping_default_weight_g`) and copied into every
 * method's `data`, because the fulfillment provider prices a cart from the
 * option's data alone and knows no tenant.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  res.json({ settings: { default_weight_g: warehouse.default_weight_g, currency_code: warehouse.currency_code } });
};

export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantShippingSettingsBody>,
  res: MedusaResponse,
) => {
  const warehouse = await getTenantWarehouse(req);
  const defaultWeightG = req.validatedBody.default_weight_g;

  await saveDefaultWeight(req, warehouse.tenant_id, defaultWeightG);

  const methods = await listTenantMethods(req, warehouse);
  if (methods.length > 0) {
    const updates = methods.map((method) => {
      const data: TenantMethodData = {
        schema: TENANT_METHOD_SCHEMA,
        tariff: method.tariff,
        description: method.description,
        delivery_hint: method.delivery_hint,
        sort_order: method.sort_order,
        default_weight_g: defaultWeightG,
        own_zone: method.own_zone,
        zone: method.zone,
        ...keptMethodData(method),
      };
      return { id: method.id, data };
    });
    await updateShippingOptionsWorkflow(req.scope).run({ input: updates });
  }

  res.json({ settings: { default_weight_g: defaultWeightG, currency_code: warehouse.currency_code } });
};
