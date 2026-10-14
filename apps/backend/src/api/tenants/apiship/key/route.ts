import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import {
  emptyApishipCredentials,
  maskApishipSettings,
  readApishipSecret,
} from "../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantApishipKeyBody } from "../../validators";

/**
 * `GET|PUT|DELETE /tenants/apiship/key` — the shop's ApiShip token alone,
 * entered by its owner (p01-settings-integrations-restructure).
 *
 * Kept for the panel screen that exists today. Since t-2026-10-14-58 the same
 * row also holds the sender and the parcel defaults (`/tenants/apiship`), so
 * a token written here is MERGED into the stored payload: replacing the token
 * must not wipe the sender the owner typed in the other drawer.
 *
 * WHAT NEVER LEAVES THIS FILE: the token. Every response is the read-back
 * state (`{ set, last4 }`), errors name the FIELD and never its content, and
 * nothing here writes the value into a log line.
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

  const existing = await readApishipSecret(pg, tenant.id, { includeDisabled: true });
  const credentials = { ...(existing?.credentials ?? emptyApishipCredentials()), token: body.token };

  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "apiship",
    credentials: credentials as unknown as Record<string, unknown>,
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
