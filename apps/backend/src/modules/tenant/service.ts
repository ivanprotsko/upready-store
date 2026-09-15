import { MedusaService } from "@medusajs/framework/utils";
import Tenant from "./models/tenant";
import TenantAdmin from "./models/tenant-admin";
import TenantArticle from "./models/tenant-article";
import TenantDomain from "./models/tenant-domain";
import TenantHandleAlias from "./models/tenant-handle-alias";
import TenantHomeConfig from "./models/tenant-home-config";
import TenantIntegrationSecret from "./models/tenant-integration-secret";
import TenantNotificationSettings from "./models/tenant-notification-settings";
import TenantLocaleSettings from "./models/tenant-locale-settings";
import TenantPage from "./models/tenant-page";
import TenantProductImport from "./models/tenant-product-import";

class TenantModuleService extends MedusaService({
  Tenant,
  TenantAdmin,
  TenantPage,
  TenantArticle,
  TenantHomeConfig,
  TenantLocaleSettings,
  TenantDomain,
  TenantHandleAlias,
  TenantIntegrationSecret,
  TenantNotificationSettings,
  TenantProductImport,
}) {}

export default TenantModuleService;
