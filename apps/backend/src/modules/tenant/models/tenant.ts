import { model } from "@medusajs/framework/utils";
import TenantAdmin from "./tenant-admin";
import TenantArticle from "./tenant-article";
import TenantDomain from "./tenant-domain";
import TenantHandleAlias from "./tenant-handle-alias";
import TenantHomeConfig from "./tenant-home-config";
import TenantIntegrationSecret from "./tenant-integration-secret";
import TenantNotificationSettings from "./tenant-notification-settings";
import TenantLocaleSettings from "./tenant-locale-settings";
import TenantPage from "./tenant-page";
import TenantProductAttribute from "./tenant-product-attribute";
import TenantProductImport from "./tenant-product-import";
import TenantRedirect from "./tenant-redirect";
import TenantRequisites from "./tenant-requisites";

/**
 * One tenant = one storefront on the shared backend. The recipe this module
 * follows (docs.medusajs.com/resources/recipes/marketplace/examples/vendors)
 * calls it a vendor; here it is the store owner of one shop.
 *
 * The two Medusa handles a tenant owns, its sales channel and its publishable
 * API key, are module links rather than columns here
 * (`src/links/tenant-sales-channel.ts`, `src/links/tenant-api-key.ts`), written
 * by `createTenantWorkflow` right after the row. A link is what Medusa's own
 * workflows maintain: `deleteSalesChannelsWorkflow` removes it through
 * `removeRemoteLinkStep`, where a text column would keep a dead id. Products a
 * tenant creates go into that sales channel, the storefront calls the API with
 * that key, and an order placed through it carries the sales channel id, which
 * is how `linkOrderToTenantWorkflow` walks the link back to the owner.
 */
const Tenant = model.define("tenant", {
  id: model.id({ prefix: "ten" }).primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  metadata: model.json().nullable(),
  admins: model.hasMany(() => TenantAdmin, {
    mappedBy: "tenant",
  }),
  // Wave 2 of the tenant panel (t-2026-09-11-mt-panel-wave-2): content pages,
  // the home-page document and custom storefront hosts belong to the tenant.
  pages: model.hasMany(() => TenantPage, {
    mappedBy: "tenant",
  }),
  home_config: model.hasOne(() => TenantHomeConfig, {
    mappedBy: "tenant",
  }),
  // t06-locale-currency: which of the 36 storefront locales this shop offers,
  // its default, and the country its default prices in.
  locale_settings: model.hasOne(() => TenantLocaleSettings, {
    mappedBy: "tenant",
  }),
  domains: model.hasMany(() => TenantDomain, {
    mappedBy: "tenant",
  }),
  // Every handle this shop has ever answered on, kept for the 301s and reserved
  // for good (`tenant-handle-alias.ts`, specs/tenant-address/CANONICAL.md §1.2).
  handle_aliases: model.hasMany(() => TenantHandleAlias, {
    mappedBy: "tenant",
  }),
  // Credentials of the shop's own third-party accounts, encrypted at rest
  // (`tenant-integration-secret.ts`, t03-tenant-secrets-robokassa).
  integration_secrets: model.hasMany(() => TenantIntegrationSecret, {
    mappedBy: "tenant",
  }),
  // Path-for-path 301s of this shop's storefront: a handle the owner changed,
  // or a row imported from a previous shop's URL structure (t11-seo-redirects,
  // `tenant-redirect.ts`).
  redirects: model.hasMany(() => TenantRedirect, {
    mappedBy: "tenant",
  }),
  // Who hears about a new order and how (`tenant-notification-settings.ts`,
  // t08-order-notifications). One row per shop, created on first use.
  notification_settings: model.hasOne(() => TenantNotificationSettings, {
    mappedBy: "tenant",
  }),
  // The shop's journal (t10-blog): one row per article per locale.
  articles: model.hasMany(() => TenantArticle, {
    mappedBy: "tenant",
  }),
  // The characteristics this shop describes its products with
  // (t15-product-attributes): the owner's own schema, not Medusa's fixed
  // weight/dimensions/material set.
  product_attributes: model.hasMany(() => TenantProductAttribute, {
    mappedBy: "tenant",
  }),
  // Catalogue files the owner uploaded (t14-product-import): one row per
  // upload, holding the dry-run report and the file it was made from.
  product_imports: model.hasMany(() => TenantProductImport, {
    mappedBy: "tenant",
  }),
  // The seller's legal details, used to fill the `{{ТОКЕН}}` placeholders left
  // in this tenant's legal pages (t12-legal-requisites, `tenant-requisites.ts`).
  requisites: model.hasOne(() => TenantRequisites, {
    mappedBy: "tenant",
  }),
});

export default Tenant;
