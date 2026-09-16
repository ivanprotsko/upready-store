/**
 * Writing the auto-link, in ONE place (w14-mp-catalog-link).
 *
 * Two callers need it — the projector, which links after every import, and the
 * panel's «Связать всё по артикулу», which links on demand — and before this
 * file the projector had its own inline upsert. One of the two would have
 * drifted from the other; the manual-link rule in `planLinkWrites` is exactly
 * the kind of rule that drifts silently, because nothing fails when a manual
 * choice is quietly overwritten (rule 20).
 *
 * The decisions are in `link.ts` and are pure. This file only writes what that
 * plan says.
 */

import { matchByVendorCode, planLinkWrites } from "./link";
import type { LinkableCard, LinkableVariant, LinkReport, StoredLinkRow } from "./link";
import type MarketplaceModuleService from "./service";

export type AutoLinkResult = {
  report: LinkReport;
  created: number;
  updated: number;
  removed: number;
  kept_manual: number;
  /** Rows written, the number the projector reports as `counts.links`. */
  written: number;
};

type LinkDraft = {
  tenant_id: string;
  marketplace: string;
  external_id: string;
  product_id: string;
  variant_id: string;
  matched_by: string;
  confidence: number;
  linked_at: Date;
};

/**
 * Matches the cards of ONE marketplace against the shop's variants and brings
 * `mp_link` in line with the answer.
 *
 * `stored` is every link of that (tenant, marketplace) as it stands now,
 * including the manual ones — they have to be IN the input for the plan to be
 * able to protect them.
 */
export const autoLink = async (
  mp: MarketplaceModuleService,
  scope: { tenant_id: string; marketplace: string },
  cards: readonly LinkableCard[],
  variants: readonly LinkableVariant[],
  linkedAt: Date = new Date(),
): Promise<AutoLinkResult> => {
  const report = matchByVendorCode(cards, variants);

  const stored = ((await mp.listMpLinks(scope)) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    external_id: String(row.external_id),
    matched_by: String(row.matched_by),
    product_id: String(row.product_id),
    variant_id: row.variant_id ? String(row.variant_id) : null,
  })) satisfies StoredLinkRow[];

  const plan = planLinkWrites<LinkDraft>(report, stored, (outcome) => ({
    tenant_id: scope.tenant_id,
    marketplace: scope.marketplace,
    external_id: outcome.external_id,
    product_id: outcome.product_id,
    variant_id: outcome.variant_id,
    matched_by: "vendor_code",
    confidence: 1,
    linked_at: linkedAt,
  }));

  if (plan.create.length) {
    await mp.createMpLinks(plan.create);
  }
  if (plan.update.length) {
    await mp.updateMpLinks(plan.update);
  }
  if (plan.remove.length) {
    await mp.softDeleteMpLinks(plan.remove);
  }

  return {
    report,
    created: plan.create.length,
    updated: plan.update.length,
    removed: plan.remove.length,
    kept_manual: plan.kept_manual.length,
    written: plan.create.length + plan.update.length,
  };
};
