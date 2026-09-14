import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import createTenantShippingMethodWorkflow from "../../../workflows/tenant/shipping-methods/create-tenant-shipping-method";
import { normaliseTariff, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../shipping-tariffs/tariff";
import {
  assertOwnedMethod,
  getTenantWarehouse,
  listTenantMethods,
  providerFor,
  resolveShippingProfileId,
} from "./helpers";
import type { PostTenantShippingMethodBody } from "./validators";

/**
 * `GET /tenants/shipping-methods` — the shop's delivery methods (its two
 * provisioned defaults included) plus the settings the screen edits next to
 * them. `POST` creates one: name, description, delivery-time hint, zone and
 * tariff, all from the owner; the price itself is never sent by a client, it
 * is derived from the tariff on the backend (`quoteTariff`).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  const methods = await listTenantMethods(req, warehouse);
  res.json({
    methods,
    settings: { default_weight_g: warehouse.default_weight_g, currency_code: warehouse.currency_code },
  });
};

export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantShippingMethodBody>,
  res: MedusaResponse,
) => {
  const warehouse = await getTenantWarehouse(req);
  const body = req.validatedBody;

  let tariff;
  try {
    tariff = normaliseTariff(body.tariff);
  } catch (error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message);
  }

  const existing = await listTenantMethods(req, warehouse);
  const data: TenantMethodData = {
    schema: TENANT_METHOD_SCHEMA,
    tariff,
    description: body.description?.trim() || null,
    delivery_hint: body.delivery_hint?.trim() || null,
    sort_order: existing.reduce((max, method) => Math.max(max, method.sort_order), -1) + 1,
    default_weight_g: warehouse.default_weight_g,
    own_zone: false,
    zone: body.zone
      ? { country_code: body.zone.country_code.toLowerCase(), provinces: body.zone.provinces ?? [] }
      : null,
  };

  const { result } = await createTenantShippingMethodWorkflow(req.scope).run({
    input: {
      name: body.name,
      data,
      enabled: body.enabled,
      provider_id: providerFor(data),
      shipping_profile_id: await resolveShippingProfileId(req),
      fulfillment_set_id: warehouse.fulfillment_set_id,
      base_service_zone_id: warehouse.base_service_zone_id,
      stock_location_id: warehouse.stock_location_id,
      currency_codes: warehouse.currency_codes,
    },
  });

  // A new zone widens the warehouse; re-read it so the new option is in scope.
  const method = await assertOwnedMethod(req, await getTenantWarehouse(req), result.id);
  res.status(201).json({ method });
};
