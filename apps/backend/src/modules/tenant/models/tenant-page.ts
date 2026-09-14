import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The five content sections a tenant fills in from its panel and its storefront
 * renders under `/<locale>/pages/<key>` and links from the footer: contacts,
 * legal details, about the shop, privacy policy, public offer. One row per
 * tenant × key × locale; `published: false` keeps a draft off the storefront
 * (`GET /store/tenant/pages/:key` answers 404 for it). Body is markdown.
 */
export const TENANT_PAGE_KEYS = ["contacts", "legal", "about", "privacy", "offer"] as const;
export type TenantPageKey = (typeof TENANT_PAGE_KEYS)[number];

const TenantPage = model
  .define("tenant_page", {
    id: model.id({ prefix: "tpage" }).primaryKey(),
    key: model.text(),
    locale: model.text().default("en"),
    title: model.text(),
    body: model.text(),
    published: model.boolean().default(false),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "pages",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "key", "locale"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantPage;
