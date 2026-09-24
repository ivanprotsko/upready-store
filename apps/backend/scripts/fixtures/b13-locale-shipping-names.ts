import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import TenantModuleService from "../../src/modules/tenant/service";
import { isTestShop, markTestShopMetadata } from "../../src/modules/tenant/test-shop";
import createTenantWorkflow from "../../src/workflows/tenant/create-tenant";
import upsertTenantLocaleSettingsWorkflow from "../../src/workflows/tenant/upsert-tenant-locale-settings";
import { relocalizeDefaultShippingMethods } from "../../src/shipping-tariffs/relocalize-default-methods";

/**
 * b13-locale-single-source acceptance fixture: two tenants that never touch
 * their two provisioned default shipping methods, one left on the
 * deployment's STOREFRONT_DEFAULT_LOCALE (ru on this stand), the other saving
 * `default_locale=en` through `PUT /tenants/locale-settings` — proving the
 * method names now follow the shop's OWN locale, not the shared env var
 * (f06 nit 2). Same shape as `t17-seed-test-tenant.ts`.
 *
 *   npx medusa exec ./scripts/fixtures/b13-locale-shipping-names.ts
 *
 * Prints the two tenants' shipping option names/descriptions before and
 * after the `en` tenant's locale save, plus the `service_zone_ids` a live
 * `GET /store/shipping-options?cart_id=…` probe can use.
 */
const PROVIDER = "emailpass";

export default async function seedB13LocaleShippingNames({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const password = "supersecret";

  const ensureTenant = async (handle: string, name: string, adminEmail: string) => {
    let [tenant] = await tenantModuleService.listTenants({ handle });
    if (tenant) {
      if (!isTestShop(tenant.metadata as Record<string, unknown> | null)) {
        await tenantModuleService.updateTenants({
          id: tenant.id,
          metadata: markTestShopMetadata(tenant.metadata as Record<string, unknown> | null),
        });
      }
      logger.info(`b13-seed: ${handle} already exists (${tenant.id})`);
      return tenant;
    }

    const registered = await authModuleService.register(PROVIDER, {
      body: { email: adminEmail, password },
    });
    if (!registered.success || !registered.authIdentity) {
      throw new Error(`b13-seed: could not register ${adminEmail}: ${registered.error}`);
    }

    const { result } = await createTenantWorkflow(container).run({
      input: {
        name,
        handle,
        admin: { email: adminEmail, first_name: "Test", last_name: "Owner" },
        authIdentityId: registered.authIdentity.id,
      },
    });
    await tenantModuleService.updateTenants({
      id: result.tenant.id,
      metadata: markTestShopMetadata(result.tenant.metadata as Record<string, unknown> | null),
    });

    logger.info(`b13-seed: created ${handle} (${result.tenant.id})`);
    return result.tenant as typeof tenant;
  };

  const printShippingOptions = async (label: string, tenantId: string) => {
    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: [
        "id",
        "name",
        "sales_channel.id",
        "sales_channel.stock_locations.id",
        "sales_channel.stock_locations.fulfillment_sets.service_zones.id",
      ],
      filters: { id: tenantId },
    });
    type Loc = { fulfillment_sets?: { service_zones?: { id: string }[] }[] };
    const zoneIds = ((tenant?.sales_channel?.stock_locations ?? []) as unknown as Loc[]).flatMap((location) =>
      (location.fulfillment_sets ?? []).flatMap((set) => (set.service_zones ?? []).map((zone) => zone.id)),
    );
    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data"],
      filters: { service_zone_id: zoneIds },
    });
    logger.info(
      `b13-seed: [${label}] ${tenant?.name} shipping options: ` +
        options
          .map((o) => {
            const d = (o.data ?? {}) as { description?: string; delivery_hint?: string | null };
            return `${o.name} (${d.description ?? "—"})`;
          })
          .join(" | "),
    );
    return zoneIds;
  };

  const shopRu = await ensureTenant("b13shopru", "B13 Shop RU", "admin@b13shopru.example");
  const shopEn = await ensureTenant("b13shopen", "B13 Shop EN", "admin@b13shopen.example");

  await printShippingOptions("ru, untouched", shopRu.id);
  await printShippingOptions("en tenant, BEFORE locale save (provisioned in the deployment default)", shopEn.id);

  await upsertTenantLocaleSettingsWorkflow(container).run({
    input: {
      tenant_id: shopEn.id,
      default_locale: "en",
      enabled_locales: ["ru", "en"],
      default_country: null,
    },
  });

  const {
    data: [withChannel],
  } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "sales_channel.stock_locations.fulfillment_sets.service_zones.id",
    ],
    filters: { id: shopEn.id },
  });
  type Loc = { fulfillment_sets?: { service_zones?: { id: string }[] }[] };
  const enZoneIds = ((withChannel?.sales_channel?.stock_locations ?? []) as unknown as Loc[]).flatMap((location) =>
    (location.fulfillment_sets ?? []).flatMap((set) => (set.service_zones ?? []).map((zone) => zone.id)),
  );
  const relocalized = await relocalizeDefaultShippingMethods(container, enZoneIds, "en");
  logger.info(`b13-seed: relocalized ${relocalized} option(s) of b13shopen to en`);

  await printShippingOptions("ru, still untouched", shopRu.id);
  await printShippingOptions("en tenant, AFTER locale save", shopEn.id);

  logger.info(`b13-seed: done — handles b13shopru (${shopRu.id}), b13shopen (${shopEn.id})`);
}
