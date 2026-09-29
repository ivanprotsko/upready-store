import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { POCHTA_PROVIDER_ID } from "../../../modules/pochta-fulfillment";
import { forgetPochtaDirectory, listDeliveryPoints } from "../../../pochta/client";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../tenant-secrets/slot";
import {
  emptyPochtaCredentials,
  maskPochtaSettings,
  normalizeToken,
  normalizeUserKey,
  readPochtaSecret,
  type PochtaCredentialsPayload,
} from "../../../tenant-secrets/pochta";
import provisionTenantPochtaMethodWorkflow from "../../../workflows/tenant/pochta/provision-tenant-pochta-method";
import { getTenantScope } from "../tenant-scope";
import { getTenantWarehouse, resolveShippingProfileId } from "../shipping-methods/helpers";
import type { PutTenantPochtaBody } from "../validators";

/**
 * `GET|PUT|DELETE /tenants/pochta` — the shop's Russian Post «Отправка» access,
 * entered by its owner (46df-pochta).
 *
 * WHAT NEVER LEAVES THIS FILE: the token and the user key. Every response is
 * the masked read-back (`{ set, last4 }`), errors name the field and never its
 * content, and nothing here logs a value.
 *
 * A save with the integration on proves the token first (one directory call),
 * the way the CDEK form proves its account: a saved-but-wrong token would show
 * the owner a green form and the buyer no delivery. Then the row is written
 * and the «Почта России — до отделения» option provisioned.
 */

const view = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readPochtaSecret(pg, tenant.id, { includeDisabled: true });

  let method: { id: string; name: string; enabled: boolean } | null = null;
  try {
    const warehouse = await getTenantWarehouse(req);
    if (warehouse.service_zone_ids.length) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: rows } = await query.graph({
        entity: "shipping_option",
        fields: ["id", "name", "provider_id", "rules.attribute", "rules.value"],
        filters: { service_zone_id: warehouse.service_zone_ids },
      });
      const row = (rows as unknown as Array<{
        id: string;
        name: string;
        provider_id: string;
        rules?: Array<{ attribute: string; value: string }>;
      }>).find((option) => option.provider_id === POCHTA_PROVIDER_ID);
      if (row) {
        method = {
          id: row.id,
          name: row.name,
          enabled: (row.rules ?? []).find((rule) => rule.attribute === "enabled_in_store")?.value === "true",
        };
      }
    }
  } catch {
    // A shop whose warehouse was never provisioned has no method to show; the
    // form itself still renders.
  }

  return {
    provider: "pochta" as const,
    label: "Почта России",
    settings: secret ? maskPochtaSettings(secret) : null,
    method,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await view(req));
};

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantPochtaBody>, res: MedusaResponse) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const existing = await readPochtaSecret(pg, tenant.id, { includeDisabled: true });
  const previous = existing?.credentials ?? emptyPochtaCredentials();
  const credentials: PochtaCredentialsPayload = {
    token: body.token !== undefined ? normalizeToken(body.token) : previous.token,
    user_key: body.clear_user_key
      ? ""
      : body.user_key !== undefined
        ? normalizeUserKey(body.user_key)
        : previous.user_key,
    sender_index: body.sender_index ?? previous.sender_index,
    default_weight_g: body.default_weight_g ?? previous.default_weight_g,
  };
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? true;

  if (isEnabled && !credentials.token) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Введите токен приложения Почты России.");
  }
  if (isEnabled && !/^\d{6}$/.test(credentials.sender_index)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Укажите индекс отделения, куда вы сдаёте посылки: без него Почта не считает тариф.",
    );
  }

  let verified: { points: number } | null = null;
  if (isEnabled) {
    try {
      forgetPochtaDirectory(credentials.token);
      const points = await listDeliveryPoints({ token: credentials.token, user_key: null });
      verified = { points: points.filter((point) => point["type-post-office"] === "PPVZ").length };
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Почта России не приняла токен: ${(error as Error).message}`,
      );
    }
  }

  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "pochta",
    credentials,
    isEnabled,
  });

  const warehouse = await getTenantWarehouse(req);
  await provisionTenantPochtaMethodWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      enabled: isEnabled,
      shipping_profile_id: await resolveShippingProfileId(req),
      base_service_zone_id: warehouse.base_service_zone_id,
      service_zone_ids: warehouse.service_zone_ids,
      stock_location_id: warehouse.stock_location_id,
      default_weight_g: credentials.default_weight_g,
    },
  });

  res.json({ ...(await view(req)), verified });
};

/** Forget the access and switch the method off; the option stays for carts that chose it. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const existing = await readPochtaSecret(pg, tenant.id, { includeDisabled: true });
  const removed = await deleteTenantSecretSlot(pg, tenantModule, tenant.id, "pochta");

  if (existing) {
    const warehouse = await getTenantWarehouse(req);
    await provisionTenantPochtaMethodWorkflow(req.scope).run({
      input: {
        tenant_id: tenant.id,
        enabled: false,
        shipping_profile_id: await resolveShippingProfileId(req),
        base_service_zone_id: warehouse.base_service_zone_id,
        service_zone_ids: warehouse.service_zone_ids,
        stock_location_id: warehouse.stock_location_id,
        default_weight_g: existing.credentials.default_weight_g,
      },
    });
  }
  res.json({ ...(await view(req)), id: removed.id, deleted: removed.deleted });
};
