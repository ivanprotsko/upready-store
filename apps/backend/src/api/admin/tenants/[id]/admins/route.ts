import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import addTenantAdminWorkflow from "../../../../../workflows/tenant/add-tenant-admin";
import { deriveArchivedAt } from "../../helpers";
import type { PostAdminTenantAdminCreateBody } from "../../validators";

const tenantNotFound = (id: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant with id "${id}" was not found`);

const assertTenantExists = async (
  tenantModuleService: TenantModuleService,
  id: string,
): Promise<{ metadata: Record<string, unknown> | null }> => {
  const tenant = await tenantModuleService.retrieveTenant(id).catch(() => null);

  if (!tenant) {
    throw tenantNotFound(id);
  }

  return { metadata: (tenant.metadata as Record<string, unknown> | null) ?? null };
};

/** `GET /admin/tenants/:id/admins` (contract §3). */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  await assertTenantExists(tenantModuleService, req.params.id);

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "admins.id",
      "admins.email",
      "admins.first_name",
      "admins.last_name",
      "admins.role",
      "admins.created_at",
      "admins.updated_at",
    ],
    filters: { id: [req.params.id] },
  });

  const admins = ((tenant?.admins ?? []) as Record<string, unknown>[])
    .filter((admin) => Boolean(admin?.id))
    .map((admin) => ({
      id: admin.id,
      email: admin.email,
      first_name: admin.first_name ?? null,
      last_name: admin.last_name ?? null,
      role: admin.role,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
    }));

  res.status(200).json({ admins });
};

/**
 * `POST /admin/tenants/:id/admins` (contract §3). Refused on an archived
 * tenant (`400`): the delete workflow closes login for the tenant's admins,
 * and adding a new one to an archived tenant would just be a dead account.
 *
 * `role` is optional (t-2026-10-07-11): without it the login is an `owner`,
 * which is what this route created before roles existed.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminTenantAdminCreateBody>,
  res: MedusaResponse,
) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const { metadata } = await assertTenantExists(tenantModuleService, req.params.id);

  if (deriveArchivedAt(metadata)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Tenant with id "${req.params.id}" is archived; it cannot take a new admin.`,
    );
  }

  const { result } = await addTenantAdminWorkflow(req.scope).run({
    input: { ...req.validatedBody, tenant_id: req.params.id },
  });

  res.status(201).json({
    admin: {
      id: result.id,
      email: result.email,
      first_name: result.first_name ?? null,
      last_name: result.last_name ?? null,
      role: result.role,
      created_at: result.created_at,
      updated_at: result.updated_at,
    },
  });
};
