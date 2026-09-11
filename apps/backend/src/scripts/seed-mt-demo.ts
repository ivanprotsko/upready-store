import path from "node:path";
import fs from "node:fs";
import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import TenantModuleService from "../modules/tenant/service";
import createTenantWorkflow from "../workflows/tenant/create-tenant";
import createTenantDomainWorkflow from "../workflows/tenant/create-tenant-domain";
import upsertTenantHomeWorkflow from "../workflows/tenant/upsert-tenant-home";
import type { TenantHomeDocument } from "../api/tenants/home/validators";

/**
 * The demo the multi-tenant test deployment is FOR (Ivan, 2026-09-11): three
 * shops on one engine, each with its own catalog, its own theme and its own
 * domain.
 *
 *   npx medusa exec ./src/scripts/seed-mt-demo.js
 *
 * It assumes the three profile catalogs are already seeded — run the ordinary
 * seed once per profile first (`STORE_PROFILE=sneakers`, then `home-goods`,
 * then `electronics`); initial-data-seed.ts's own header documents that a
 * second run adds a profile instead of a second store.
 *
 * Idempotent throughout: an existing tenant, an existing domain row and an
 * existing home document are all left as they are, so re-running after a fix
 * costs nothing.
 *
 * What it does NOT do: touch DNS or the proxy. A tenant's hosts reach traefik
 * through deploy/scripts/tenant-ingress-sync.sh, which reads these same rows.
 */
const DEMO = [
  {
    handle: "acme",
    name: "Acme",
    admin: { email: "admin@acme.test", first_name: "Ada", last_name: "Acme" },
    profile: "sneakers",
    theme: "sneakers" as const,
    domains: ["custombot.space", "www.custombot.space"],
  },
  {
    handle: "globex",
    name: "Globex",
    admin: { email: "admin@globex.test", first_name: "Gus", last_name: "Globex" },
    profile: "home-goods",
    theme: "home-goods" as const,
    domains: ["setpomo.com", "www.setpomo.com"],
  },
  {
    handle: "initech",
    name: "Initech",
    admin: { email: "admin@initech.test", first_name: "Ida", last_name: "Initech" },
    profile: "electronics",
    theme: "electronics" as const,
    domains: ["shiftship.dev", "www.shiftship.dev"],
  },
];

const PROVIDER = "emailpass";

/**
 * The handles of one profile's catalog, read from the seed data that produced
 * it. Reading the file is what makes "which products are this tenant's" a fact
 * rather than a guess about sales-channel names: the same list seeded them.
 *
 * `medusa build` copies `src/migration-scripts/data` next to the compiled
 * script (scripts/copy-migration-data.js), so this path resolves in the image
 * exactly as it does from source.
 */
const profileHandles = (profile: string): string[] => {
  const file = path.join(__dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "products.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { handle: string }[];
  const handles = parsed.map((product) => product.handle).filter(Boolean);

  if (handles.length === 0) {
    // Zero is not empty (rule 20): a silently empty catalog would hand the
    // tenant an empty shop and read as "the profile has no products".
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `seed-mt-demo: ${file} lists no product handle.`,
    );
  }

  return handles;
};

export default async function seedMtDemo({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const storeModuleService = container.resolve(Modules.STORE);
  const password = process.env.TENANT_SEED_PASSWORD || "supersecret";

  // The composition every tenant starts from: the store's own default document,
  // written by seed-storefront-settings.ts. Copying it keeps `settings` a
  // document that already passes the route's validator, instead of a second
  // hand-written transcription of its six enums.
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const defaultSettings = (store?.metadata as Record<string, unknown> | undefined)?.storefrontSettings;

  if (!defaultSettings) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "seed-mt-demo: store.metadata.storefrontSettings is missing — run the backend once so seed-storefront-settings has written it.",
    );
  }

  for (const demo of DEMO) {
    let [tenant] = await tenantModuleService.listTenants({ handle: demo.handle });

    if (!tenant) {
      const registered = await authModuleService.register(PROVIDER, {
        body: { email: demo.admin.email, password },
      });

      if (!registered.success || !registered.authIdentity) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `seed-mt-demo: could not register a login for ${demo.admin.email}: ${registered.error ?? "no reason given"}.`,
        );
      }

      const { result } = await createTenantWorkflow(container).run({
        input: {
          name: demo.name,
          handle: demo.handle,
          admin: demo.admin,
          authIdentityId: registered.authIdentity.id,
        },
      });

      tenant = result.tenant as typeof tenant;
      logger.info(`seed-mt-demo: created ${demo.handle} (${result.tenant.id}), key ${result.tenant.api_key.token}`);
    } else {
      logger.info(`seed-mt-demo: ${demo.handle} already exists (${tenant.id})`);
    }

    // The tenant's own sales channel, through the link the workflow made.
    const { data: [withChannel] } = await query.graph({
      entity: "tenant",
      fields: ["id", "handle", "sales_channel.id"],
      filters: { id: [tenant.id] },
    });
    const salesChannelId = withChannel?.sales_channel?.id as string | undefined;

    if (!salesChannelId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-mt-demo: tenant ${demo.handle} has no sales channel link.`,
      );
    }

    // Move this profile's catalog into the tenant's channel: add the link that
    // makes the products visible through the tenant's publishable key, and
    // dismiss every OTHER channel's link so the same product is not on a
    // neighbour's storefront. This IS the isolation mechanism — a product is
    // only ever fetched through the channel its key resolves to.
    const handles = profileHandles(demo.profile);
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "sales_channels.id"],
      filters: { handle: handles },
    });

    if (products.length === 0) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-mt-demo: none of the ${handles.length} products of profile "${demo.profile}" is in this database — seed that profile first (STORE_PROFILE=${demo.profile}).`,
      );
    }

    let added = 0;
    let dismissed = 0;

    for (const product of products) {
      const linked = ((product.sales_channels ?? []) as { id: string }[]).map((channel) => channel.id);

      if (!linked.includes(salesChannelId)) {
        await link.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        });
        added += 1;
      }

      for (const other of linked.filter((id) => id !== salesChannelId)) {
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: other },
        });
        dismissed += 1;
      }
    }

    logger.info(
      `seed-mt-demo: ${demo.handle} — ${products.length}/${handles.length} products of "${demo.profile}", ${added} linked to its channel, ${dismissed} foreign channel link(s) dismissed`,
    );

    // The theme is what makes the three shops tell themselves apart at a glance.
    const [home] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenant.id });

    if (!home) {
      const document = {
        schema: "upready.tenant-home/v1",
        theme: { preset: demo.theme },
        settings: defaultSettings,
        content: {
          hero: {
            title: demo.name,
            subtitle: `${demo.name} runs on the shared engine and answers on its own domain.`,
            cta_label: "Shop",
            cta_href: "/store",
            image_url: null,
          },
          products: { source: "popular" },
          order: ["hero", "categories", "products"],
        },
        updatedAt: new Date().toISOString(),
      } as unknown as TenantHomeDocument;

      await upsertTenantHomeWorkflow(container).run({
        input: { tenant_id: tenant.id, config: document },
      });
      logger.info(`seed-mt-demo: ${demo.handle} — home document written, theme "${demo.theme}"`);
    } else {
      logger.info(`seed-mt-demo: ${demo.handle} — home document already exists, left alone`);
    }

    for (const host of demo.domains) {
      const [existing] = await tenantModuleService.listTenantDomains({ host });

      if (existing) {
        logger.info(`seed-mt-demo: ${host} already claimed (tenant ${existing.tenant_id})`);
        continue;
      }

      await createTenantDomainWorkflow(container).run({
        input: { tenant_id: tenant.id, host },
      });
      logger.info(`seed-mt-demo: ${demo.handle} — domain ${host} attached`);
    }
  }
}
