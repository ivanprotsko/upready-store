import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * Writes a `tenant_home_config` row straight through the module service, for
 * one tenant named by handle.
 *
 *   TENANT_HOME_SEED='{"globex":{"preset":"home-goods","defaultMode":"light"}}' \
 *     medusa exec ./src/scripts/seed-tenant-home.ts
 *
 * Why a script and not the API: `PUT /tenants/home` is piece 8 of the same wave
 * and is being built in a different worktree, so it does not exist here
 * (tenant-panel wave 2, piece 9 — the piece prompt names this fallback). The
 * document shape is the contract's `upready.tenant-home/v1`
 * (`docs/tenant-panel/api-contract.md`, "Piece 8"); this script writes the
 * `theme` and `settings` halves, which are the two the storefront's Host
 * resolver reads. It never touches a tenant not named in the input, so a row
 * another worker seeded on this shared stand stays as it is.
 */

type SeedEntry = {
  preset: string;
  defaultMode: "light" | "dark";
  header?: string;
  hero?: string;
  tiles?: string;
  listing?: string;
  footer?: string;
};

export default async function seedTenantHome({ container }: { container: MedusaContainer }) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const raw = process.env.TENANT_HOME_SEED;

  if (!raw) {
    logger.error("TENANT_HOME_SEED is required, e.g. '{\"globex\":{\"preset\":\"home-goods\",\"defaultMode\":\"light\"}}'");
    return;
  }

  const seed = JSON.parse(raw) as Record<string, SeedEntry>;

  for (const [handle, entry] of Object.entries(seed)) {
    const {
      data: [tenant],
    } = await query.graph({
      entity: "tenant",
      fields: ["id", "handle", "home_config.id"],
      filters: { handle: [handle] },
    });

    if (!tenant?.id) {
      logger.error(`No tenant with handle "${handle}"; nothing written.`);
      continue;
    }

    const config = {
      schema: "upready.tenant-home/v1",
      theme: { preset: entry.preset },
      settings: {
        defaultMode: entry.defaultMode,
        header: entry.header ?? "h2",
        hero: entry.hero ?? "h",
        tiles: entry.tiles ?? "on",
        listing: entry.listing ?? "p4",
        footer: entry.footer ?? "f4",
      },
      content: {
        hero: {
          title: `${tenant.handle} storefront`,
          subtitle: "Seeded by scripts/seed-tenant-home.ts for the piece-9 acceptance",
          cta_label: "Shop",
          cta_href: "/store",
          image_url: null,
        },
        products: { source: "popular" },
        order: ["hero", "categories", "products"],
      },
      updatedAt: new Date().toISOString(),
    };

    const existingId = tenant.home_config?.id as string | undefined;

    if (existingId) {
      await tenantModuleService.updateTenantHomeConfigs({ id: existingId, config });
      logger.info(`Updated tenant_home_config ${existingId} for "${handle}" → ${entry.preset}/${entry.defaultMode}`);
    } else {
      const created = await tenantModuleService.createTenantHomeConfigs({
        config,
        tenant_id: tenant.id,
      });
      logger.info(`Created tenant_home_config ${created.id} for "${handle}" → ${entry.preset}/${entry.defaultMode}`);
    }
  }
}
