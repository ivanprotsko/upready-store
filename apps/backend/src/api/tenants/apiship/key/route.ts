import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import { maskApishipSettings, readApishipSecret } from "../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantApishipKeyBody } from "../../validators";

/**
 * `GET|PUT|DELETE /tenants/apiship/key` — the shop's ApiShip token, entered by
 * its owner (p01-settings-integrations-restructure).
 *
 * The same shape the marketplace key routes have and the same ONE writer
 * (`tenant-secrets/slot.ts`): the encryption, the revival of a soft-deleted row
 * and the enabled default are decided once for every slot (rule 20). ApiShip is
 * not a marketplace adapter, so it cannot ride the registry-driven
 * `/tenants/marketplaces/:marketplace/key` family; it gets the same contract by
 * calling the same writer, not by a second copy of it.
 *
 * WHAT NEVER LEAVES THIS FILE: the token. Every response is the read-back state
 * (`{ set, last4 }`), errors name the FIELD and never its content, and nothing
 * here writes the value into a log line.
 *
 * Whether the token WORKS is a different question with its own route
 * (`GET /tenants/apiship/probe`), because answering it means a call to ApiShip
 * and a form must not wait on a vendor to render (rule 19h).
 */

const view = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readApishipSecret(pg, tenant.id, { includeDisabled: true });
  return {
    provider: "apiship" as const,
    label: "ApiShip",
    settings: secret ? maskApishipSettings(secret) : null,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await view(req));
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantApishipKeyBody>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "apiship",
    credentials: { token: body.token },
    isEnabled: body.is_enabled,
  });

  res.json(await view(req));
};

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await deleteTenantSecretSlot(pg, tenantModule, tenant.id, "apiship");
  res.json({ ...(await view(req)), id: removed.id, deleted: removed.deleted });
};
