import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { TenantHomeDocument } from "../api/tenants/home/validators";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import upsertTenantHomeWorkflow from "../workflows/tenant/upsert-tenant-home";

/**
 * Gives the home documents the onboarding wizard wrote BEFORE `content.hero.i18n`
 * existed the English half of their own copy. The wizard writes one Russian sentence
 * (`apps/storefront/src/app/api/demo/onboarding/route.ts`) and, since this fix, its
 * English twin under `i18n.en`; a shop created earlier shows the Russian sentence to
 * an English visitor for good unless this runs once. Only documents whose subtitle IS
 * the wizard's sentence are touched — an owner's own words are never rewritten. The
 * three demo shops get their Russian copy from `seed-mt-demo.ts`, not from here.
 *
 *   docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-hero-copy.js
 */
const WIZARD_SUBTITLE_RU = "Новый магазин на общем движке, со своим адресом.";
const WIZARD_COPY_EN = {
  subtitle: "A new shop on the shared engine, at its own address.",
  cta_label: "Shop",
};

type HeroDocument = {
  content?: { hero?: { subtitle?: string; i18n?: Record<string, unknown> } };
  updatedAt?: string;
};

export default async function backfillHeroCopy({ container }: { container: MedusaContainer }) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const homes = await tenantModuleService.listTenantHomeConfigs({});
  let patched = 0;
  let skipped = 0;

  for (const home of homes) {
    const document = home.config as HeroDocument;
    const hero = document?.content?.hero;

    if (!hero || hero.i18n || hero.subtitle !== WIZARD_SUBTITLE_RU) {
      skipped += 1;
      continue;
    }

    hero.i18n = { en: WIZARD_COPY_EN };
    document.updatedAt = new Date().toISOString();

    await upsertTenantHomeWorkflow(container).run({
      input: { tenant_id: home.tenant_id, config: document as unknown as TenantHomeDocument },
    });
    patched += 1;
    logger.info(`backfill-hero-copy: tenant ${home.tenant_id} — wizard copy given its English twin`);
  }

  logger.info(
    `backfill-hero-copy: ${homes.length} home documents, ${patched} patched, ${skipped} left alone (own copy, already localized, or no hero).`,
  );
}
