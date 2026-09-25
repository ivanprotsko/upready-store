import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { PLATFORM_PRICING_MODULE } from "../../src/modules/platform-pricing";
import { PricingDocumentSchema } from "../../src/modules/platform-pricing/schema";
import type PlatformPricingModuleService from "../../src/modules/platform-pricing/service";
import { OKSANA_3TIER_PRICING } from "../../src/modules/platform-pricing/seed/oksana-3tier";

/**
 * t-2026-09-25-08: fills the platform's pricing page (`/pricing` on the platform
 * hosts) with the tariffs of Ivan's `oksana-3tier-pricing.html`
 * (`src/modules/platform-pricing/seed/oksana-3tier.ts`).
 *
 *   DRY_RUN=1 npx medusa exec ./scripts/fixtures/p01-platform-pricing-seed.ts   # the plan, no write
 *   npx medusa exec ./scripts/fixtures/p01-platform-pricing-seed.ts             # create it
 *   OVERWRITE=1 npx medusa exec ./scripts/fixtures/p01-platform-pricing-seed.ts # put the seed back over an edit
 *
 * Idempotent: the stored page is compared with the seed first (key order does
 * not count, jsonb keeps its own) and nothing is written when they are equal.
 * A page that differs is somebody's edit in the admin, so it is replaced only
 * with `OVERWRITE=1`; without it the script prints what differs and fails.
 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Paths where `a` and `b` differ, at most `limit` of them. */
function diffPaths(a: Json | undefined, b: Json | undefined, path: string, out: string[], limit = 20): void {
  if (out.length >= limit) return;
  if (a === b) return;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      diffPaths((a as Record<string, Json>)[key], (b as Record<string, Json>)[key], path ? `${path}.${key}` : key, out, limit);
    }
    return;
  }
  out.push(path || "(root)");
}

export default async function seedPlatformPricing({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const service: PlatformPricingModuleService = container.resolve(PLATFORM_PRICING_MODULE);
  const dryRun = process.env.DRY_RUN === "1";
  const overwrite = process.env.OVERWRITE === "1";
  const tag = "p01-platform-pricing-seed";

  const seed = PricingDocumentSchema.parse(OKSANA_3TIER_PRICING);
  const rows = seed.sections.reduce((n, s) => n + s.rows.length, 0);
  const features = seed.tiers.reduce((n, t) => n + t.features.length, 0);
  const tips =
    seed.tiers.reduce((n, t) => n + t.features.filter((f) => f.tip).length, 0) +
    seed.sections.reduce((n, s) => n + s.rows.filter((r) => r.tip).length, 0);
  logger.info(
    `${tag}: seed = ${seed.tiers.length} tiers (${seed.tiers.map((t) => t.name).join(" / ")}), ` +
      `${seed.sections.length} sections, ${rows} rows, ${features} card features, ` +
      `a tooltip on ${tips} of those ${rows + features} items`,
  );

  const current = await service.retrievePage();

  if (current) {
    const differs: string[] = [];
    diffPaths(current.document as Json, seed as unknown as Json, "", differs);

    if (differs.length === 0) {
      logger.info(`${tag}: page "default" revision ${current.revision} already holds the seed — no changes`);
      return;
    }

    logger.info(`${tag}: page "default" revision ${current.revision} differs from the seed at: ${differs.join(", ")}`);
    if (dryRun) {
      logger.info(
        overwrite
          ? `${tag}: DRY_RUN=1 — would overwrite revision ${current.revision} with the seed, nothing written`
          : `${tag}: DRY_RUN=1 — a real run would refuse without OVERWRITE=1, nothing written`,
      );
      return;
    }
    if (!overwrite) {
      throw new Error(`${tag}: the stored page was edited; rerun with OVERWRITE=1 to replace it with the seed`);
    }

    const saved = await service.savePage({ document: seed, expectedRevision: current.revision, updatedBy: null });
    logger.info(`${tag}: overwrote the page with the seed, revision ${current.revision} -> ${saved.revision}`);
    return;
  }

  if (dryRun) {
    logger.info(`${tag}: DRY_RUN=1 — would create page "default" at revision 1, nothing written`);
    return;
  }

  const saved = await service.savePage({ document: seed, expectedRevision: null, updatedBy: null });
  logger.info(`${tag}: created page "default" (${saved.id}) at revision ${saved.revision}`);
}
