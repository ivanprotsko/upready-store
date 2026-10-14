import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { listTariffs } from "../../../../apiship/client";
import { carrierLabel } from "../../../../apiship/carriers";
import { apishipApiCredentials, readApishipSecret } from "../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/apiship/tariffs?provider_key=cdek` — the carrier's tariff
 * catalogue as ApiShip lists it (t-2026-10-14-58), for the settings drawer
 * where the owner may pin one tariff per carrier instead of «the cheapest».
 * Read-only; 111 rows for СДЭК and 12 for Почта России on the test contour.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const providerKey = String((req.query as Record<string, unknown>)?.provider_key ?? "").trim();
  if (!providerKey) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите перевозчика (provider_key).");
  }

  const api = apishipApiCredentials(await readApishipSecret(pg, tenant.id, { includeDisabled: true }));
  if (!api) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "ApiShip не подключён в этом магазине");
  }

  const tariffs = await listTariffs(api, { providerKey });
  res.json({
    provider_key: providerKey,
    label: carrierLabel(providerKey),
    tariffs: tariffs.map((tariff) => ({
      id: tariff.id,
      name: tariff.aliasName ?? tariff.name,
      description: tariff.description,
      weight_min_g: tariff.weightMin,
      weight_max_g: tariff.weightMax,
      pickup_type: tariff.pickupType,
      delivery_type: tariff.deliveryType,
    })),
  });
};
