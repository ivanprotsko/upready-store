import { MedusaService } from "@medusajs/framework/utils";
import Tenant from "./models/tenant";
import TenantAdmin from "./models/tenant-admin";

class TenantModuleService extends MedusaService({
  Tenant,
  TenantAdmin,
}) {}

export default TenantModuleService;
