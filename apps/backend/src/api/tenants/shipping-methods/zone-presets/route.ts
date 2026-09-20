import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import createTenantShippingMethodWorkflow from "../../../../workflows/tenant/shipping-methods/create-tenant-shipping-method";
import { SHIPPING_CARRIERS, carrierByKey } from "../../../../shipping-tariffs/carriers";
import { RU_ZONE_PRESETS, presetByKey, provincesOfPreset, regionsOfPreset } from "../../../../shipping-tariffs/ru-zone-presets";
import { normaliseTariff, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";
import {
  getTenantWarehouse,
  labelledZone,
  listTenantMethods,
  providerFor,
  resolveShippingProfileId,
} from "../helpers";
import type { PostTenantZonePresetsBody } from "../validators";

/**
 * `GET|POST /tenants/shipping-methods/zone-presets` — the nine ready-made
 * Russian zones (`ru-zone-presets.ts`) and the carriers a method can name.
 *
 * `POST` creates one «base + price per kg» method per chosen zone in a single
 * call, because the owner's actual request is a TABLE of nine prices, not nine
 * trips through the create form («цена за кг по зонам», #463839). Every method
 * it writes is an ordinary method afterwards: same edit screen, same delete,
 * its region list open to editing.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  const existing = await listTenantMethods(req, warehouse);
  const taken = new Set(existing.map((method) => method.name));

  res.json({
    currency_code: warehouse.currency_code,
    carriers: SHIPPING_CARRIERS,
    presets: RU_ZONE_PRESETS.map((preset) => ({
      key: preset.key,
      name: preset.name,
      description: preset.description,
      regions: regionsOfPreset(preset).map((region) => ({ code: region.code, name: region.name })),
      provinces: provincesOfPreset(preset),
    })),
    /** Names already in use, so the panel can show which zones are set up. */
    existing_names: Array.from(taken),
  });
};

export const POST = async (req: AuthenticatedMedusaRequest<PostTenantZonePresetsBody>, res: MedusaResponse) => {
  const warehouse = await getTenantWarehouse(req);
  const body = req.validatedBody;

  const carrier = carrierByKey(body.carrier);
  if (!carrier) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown carrier: ${body.carrier}`);
  }

  const baseName = body.name?.trim() || carrier.method_name;
  const description = body.description === undefined ? carrier.description : (body.description?.trim() || null);
  const deliveryHint =
    body.delivery_hint === undefined ? carrier.delivery_hint : (body.delivery_hint?.trim() || null);

  const existing = await listTenantMethods(req, warehouse);
  const taken = new Set(existing.map((method) => method.name));
  const shippingProfileId = await resolveShippingProfileId(req);
  let sortOrder = existing.reduce((max, method) => Math.max(max, method.sort_order), -1) + 1;

  const created: { key: string; name: string; id: string }[] = [];
  const skipped: { key: string; name: string; reason: string }[] = [];

  for (const zone of body.zones) {
    const preset = presetByKey(zone.key);
    if (!preset) {
      skipped.push({ key: zone.key, name: zone.key, reason: "Такой зоны нет" });
      continue;
    }
    const name = `${baseName} — ${preset.name}`;
    if (taken.has(name)) {
      skipped.push({ key: zone.key, name, reason: "Способ с таким названием уже есть" });
      continue;
    }

    const tariff = normaliseTariff({
      kind: "per_kg",
      base_amount: zone.base_amount,
      per_kg_amount: zone.per_kg_amount,
      min_weight_g: zone.min_weight_g ?? null,
    });

    const data: TenantMethodData = {
      schema: TENANT_METHOD_SCHEMA,
      tariff,
      description,
      delivery_hint: deliveryHint,
      sort_order: sortOrder,
      default_weight_g: warehouse.default_weight_g,
      own_zone: false,
      zone: labelledZone("ru", provincesOfPreset(preset)),
      carrier: carrier.key,
    };

    const { result } = await createTenantShippingMethodWorkflow(req.scope).run({
      input: {
        name,
        data,
        enabled: body.enabled,
        provider_id: providerFor(data),
        shipping_profile_id: shippingProfileId,
        fulfillment_set_id: warehouse.fulfillment_set_id,
        base_service_zone_id: warehouse.base_service_zone_id,
        stock_location_id: warehouse.stock_location_id,
        currency_codes: warehouse.currency_codes,
      },
    });

    created.push({ key: preset.key, name, id: result.id });
    taken.add(name);
    sortOrder += 1;
  }

  // The new zones widened the warehouse; re-read it so the answer lists the
  // methods as the panel will now see them.
  const methods = await listTenantMethods(req, await getTenantWarehouse(req));
  res.status(201).json({ created, skipped, methods });
};
