import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import { autoLink } from "../../../../../modules/marketplace/autolink";
import { linkSummary } from "../../../../../modules/marketplace/link";
import { tenantVariants } from "../../../../../modules/marketplace/project";
import { MARKETPLACE_IDS } from "../../../../../modules/marketplace/registry";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import { getTenantScope } from "../../../tenant-scope";

/**
 * `POST /tenants/marketplaces/catalog/auto-link` — link every card whose
 * article matches exactly one product of the shop (w14-mp-catalog-link,
 * spec 2.4).
 *
 * It spends no marketplace request: the cards are already in `mp_product` and
 * the shop's articles are already in `product_variant`. What it writes is
 * decided by `planLinkWrites`, which the projector uses too, so an auto-link
 * from this button and an auto-link from an import cannot disagree (rule 20).
 *
 * THE AMBIGUOUS CARD IS NOT LINKED, by this route or by any other. More than
 * one product of the shop carries that article, nothing here knows which one
 * is meant, and choosing the first would put the marketplace's price on the
 * wrong product for good (rule 20a). It stays in «требует выбора» until a
 * person chooses, and the response counts it.
 *
 * A link a person made (`matched_by = 'manual'`) is never rewritten and never
 * removed here. A link this rule made that the rule no longer produces IS
 * removed, because a stale link is a claim nothing supports.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const variants = await tenantVariants({ container: req.scope, tenantId: tenant.id });

  /**
   * Typed on the way in: an empty literal infers `never[]`, and the first push
   * is then a type error rather than a list.
   */
  const marketplaces: Array<{
    marketplace: string;
    cards: number;
    linked: number;
    not_found: number;
    needs_choice: number;
    created: number;
    updated: number;
    removed: number;
    kept_manual: number;
    summary: string;
  }> = [];

  for (const marketplace of MARKETPLACE_IDS) {
    const scope = { tenant_id: tenant.id, marketplace };
    const cards = ((await mp.listMpProducts(scope)) as Record<string, unknown>[]).map((row) => ({
      external_id: String(row.external_id),
      vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    }));

    const outcome = await autoLink(mp, scope, cards, variants);

    marketplaces.push({
      marketplace,
      cards: outcome.report.total,
      linked: outcome.report.linked.length,
      not_found: outcome.report.notFound.length,
      needs_choice: outcome.report.ambiguous.length,
      created: outcome.created,
      updated: outcome.updated,
      removed: outcome.removed,
      kept_manual: outcome.kept_manual,
      summary: linkSummary(outcome.report),
    });
  }

  res.json({ marketplaces, variants: variants.length });
};
