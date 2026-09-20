import type { MedusaContainer } from "@medusajs/framework";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import type { RequisitesRow } from "./requisites";

const requisitesService = (container: MedusaContainer): TenantModuleService =>
  container.resolve<TenantModuleService>(TENANT_MODULE);

export type TenantRequisitesRecord = RequisitesRow & { id: string; tenant_id: string };

/**
 * The shop's requisites row, or `null` when the owner has never opened the
 * screen. Absence means "nothing filled in yet", the same state the resolver
 * treats every column of as blank.
 */
export const readRequisites = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<TenantRequisitesRecord | null> => {
  const rows = await requisitesService(container).listTenantRequisites({ tenant_id: tenantId });
  return (rows[0] as TenantRequisitesRecord | undefined) ?? null;
};

/** Creates the row on first use, so a caller (the panel's PUT) never has to branch on its absence. */
export const ensureRequisites = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<TenantRequisitesRecord> => {
  const existing = await readRequisites(container, tenantId);

  if (existing) {
    return existing;
  }

  const created = await requisitesService(container).createTenantRequisites({ tenant_id: tenantId });

  return (Array.isArray(created) ? created[0] : created) as TenantRequisitesRecord;
};
