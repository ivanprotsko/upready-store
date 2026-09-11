import { MedusaService } from "@medusajs/framework/utils";
import Tenant from "./models/tenant";
import TenantAdmin from "./models/tenant-admin";
import TenantDomain from "./models/tenant-domain";
import TenantHomeConfig from "./models/tenant-home-config";
import TenantPage from "./models/tenant-page";

class TenantModuleService extends MedusaService({
  Tenant,
  TenantAdmin,
  TenantPage,
  TenantHomeConfig,
  TenantDomain,
}) {}

export default TenantModuleService;
