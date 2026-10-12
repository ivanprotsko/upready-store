import type { MedusaContainer } from "@medusajs/framework/types";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import type { TenantHomeDocument } from "./validators";

/** The tenant's one `tenant_home_config` row, or null when it never saved a document. */
export const readTenantHomeDocument = async (
  scope: MedusaContainer,
  tenantId: string,
): Promise<{ id: string; document: TenantHomeDocument } | null> => {
  const tenantModuleService: TenantModuleService = scope.resolve(TENANT_MODULE);
  const [row] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenantId });

  if (!row) {
    return null;
  }

  return { id: row.id, document: row.config as unknown as TenantHomeDocument };
};
