import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../tenant-secrets/slot";
import {
  emptyTributeCredentials,
  maskTributeSettings,
  readTributeSecret,
  type TributeCredentials,
} from "../../../tenant-secrets/tribute";
import { getTenantScope } from "../tenant-scope";
import { backendPublicOrigin } from "../payment-settings/helpers";
import type { PutTenantTributeBody } from "../validators";

/**
 * `GET|PUT|DELETE /tenants/tribute` — the shop's Tribute Shop API key, entered
 * by its owner (t-cherk-22), the same self-service shape as `/tenants/pochta`.
 *
 * WHAT NEVER LEAVES THIS FILE: the API key. Every response is the masked
 * read-back (`{ set, last4 }`); no route logs the value.
 *
 * Unlike Pochta's token, the key is not proven against Tribute before saving:
 * there is no sandbox and no side-effect-free probe call documented
 * (`POST /shop/orders` always creates a real order). The owner finds out the
 * key is wrong the same way they find out any webhook credential is wrong —
 * the first real payment attempt fails — which is why the response also
 * names the exact webhook URL to paste into the Tribute dashboard, so a typo
 * there is at least ruled out.
 */

const callbackUrlFor = (req: AuthenticatedMedusaRequest, tenantId: string): string =>
  `${backendPublicOrigin(req)}/tribute/webhook/${tenantId}`;

const view = async (req: AuthenticatedMedusaRequest, tenantId: string) => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readTributeSecret(pg, tenantId, { includeDisabled: true });

  return {
    provider: "tribute" as const,
    label: "Tribute",
    settings: secret ? maskTributeSettings(secret) : null,
    callback_url: callbackUrlFor(req, tenantId),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  res.json(await view(req, tenant.id));
};

export const PUT = async (req: AuthenticatedMedusaRequest<PutTenantTributeBody>, res: MedusaResponse) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const existing = await readTributeSecret(pg, tenant.id, { includeDisabled: true });
  const previous = existing?.credentials ?? emptyTributeCredentials();
  const credentials: TributeCredentials = {
    api_key: body.api_key !== undefined ? body.api_key : previous.api_key,
    shop_id: body.shop_id !== undefined ? body.shop_id : previous.shop_id,
  };
  const isEnabled = body.is_enabled ?? existing?.is_enabled ?? true;

  if (isEnabled && !credentials.api_key) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Введите API-ключ магазина Tribute.");
  }

  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "tribute",
    credentials,
    isEnabled,
  });

  res.json(await view(req, tenant.id));
};

/** Forget the key and switch Tribute off; a cart payment already in flight is unaffected. */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await deleteTenantSecretSlot(pg, tenantModule, tenant.id, "tribute");

  res.json({ ...(await view(req, tenant.id)), id: removed.id, deleted: removed.deleted });
};
