import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * One client with several sites (`docs/multitenancy/sites-one-db-many-storefronts.md`
 * §3.1, t-2026-09-24-n12). Each site stays a tenant of its own, with its own
 * domains, sales channel, delivery, payment and orders; the group is only the
 * fact that these tenants belong to the same owner.
 *
 * `tenant.group_id` is nullable, and a tenant without a group behaves exactly
 * as it did before this model existed. The group is created implicitly by the
 * first «Создать сайт» of a tenant that has none, and the owner never sees the
 * word: the panel shows «мои сайты».
 *
 * What the group grants today: `POST /tenants/me/switch` into any tenant of the
 * caller's own group, and `GET /tenants/me/shops` listing them.
 */
const TenantGroup = model.define("tenant_group", {
  id: model.id({ prefix: "tgrp" }).primaryKey(),
  name: model.text(),
  metadata: model.json().nullable(),
  tenants: model.hasMany(() => Tenant, {
    mappedBy: "group",
  }),
});

export default TenantGroup;
