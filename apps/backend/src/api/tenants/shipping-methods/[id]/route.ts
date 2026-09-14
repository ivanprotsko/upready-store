import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import deleteTenantShippingMethodWorkflow from "../../../../workflows/tenant/shipping-methods/delete-tenant-shipping-method";
import updateTenantShippingMethodWorkflow from "../../../../workflows/tenant/shipping-methods/update-tenant-shipping-method";
import { normaliseTariff, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";
import { assertOwnedMethod, getTenantWarehouse, providerFor } from "../helpers";
import type { PostTenantShippingMethodUpdateBody } from "../validators";

/**
 * `GET|POST|DELETE /tenants/shipping-methods/:id` — one of the shop's own
 * methods. Ownership is the warehouse's zones (`assertOwnedMethod`), checked
 * before any workflow runs; a foreign id is a 404.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  const method = await assertOwnedMethod(req, warehouse, req.params.id);
  res.json({ method });
};

export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantShippingMethodUpdateBody>,
  res: MedusaResponse,
) => {
  const warehouse = await getTenantWarehouse(req);
  const current = await assertOwnedMethod(req, warehouse, req.params.id);
  const body = req.validatedBody;

  let tariff = current.tariff;
  if (body.tariff) {
    try {
      tariff = normaliseTariff(body.tariff);
    } catch (error) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message);
    }
  }

  const zone =
    body.zone === undefined
      ? current.zone
      : body.zone
        ? { country_code: body.zone.country_code.toLowerCase(), provinces: body.zone.provinces ?? [] }
        : null;

  const data: TenantMethodData = {
    schema: TENANT_METHOD_SCHEMA,
    tariff,
    description: body.description === undefined ? current.description : body.description?.trim() || null,
    delivery_hint: body.delivery_hint === undefined ? current.delivery_hint : body.delivery_hint?.trim() || null,
    sort_order: current.sort_order,
    default_weight_g: warehouse.default_weight_g,
    own_zone: current.own_zone,
    zone,
  };

  await updateTenantShippingMethodWorkflow(req.scope).run({
    input: {
      id: current.id,
      name: body.name ?? current.name,
      data,
      enabled: body.enabled ?? current.enabled,
      current_service_zone_id: current.service_zone_id,
      current_own_zone: current.own_zone,
      provider_id: providerFor(data, current.provider_id),
      fulfillment_set_id: warehouse.fulfillment_set_id,
      base_service_zone_id: warehouse.base_service_zone_id,
      stock_location_id: warehouse.stock_location_id,
      currency_codes: warehouse.currency_codes,
    },
  });

  const method = await assertOwnedMethod(req, await getTenantWarehouse(req), current.id);
  res.json({ method });
};

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  const current = await assertOwnedMethod(req, warehouse, req.params.id);

  await deleteTenantShippingMethodWorkflow(req.scope).run({
    input: { id: current.id, service_zone_id: current.service_zone_id, own_zone: current.own_zone },
  });

  res.json({ id: current.id, object: "shipping_option", deleted: true });
};
