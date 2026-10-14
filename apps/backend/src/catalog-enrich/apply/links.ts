import type { MedusaContainer } from "@medusajs/framework";
import { MARKETPLACE_LINK_MODULE } from "../../modules/marketplace-link";
import type MarketplaceLinkModuleService from "../../modules/marketplace-link/service";
import type { DatasetProduct } from "../dataset";
import type { ApplyOptions } from "./live";

/**
 * The marketplace links a dataset carries, written into the link table.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

export type LinkCounters = { created: number; updated: number; unchanged: number };

/**
 * The link table after this run: one live row per (tenant, marketplace,
 * product), so a re-run updates instead of doubling.
 */
export const writeLinks = async (
  container: MedusaContainer,
  tenantId: string,
  entries: { product_id: string; entry: DatasetProduct }[],
  options: ApplyOptions,
): Promise<LinkCounters> => {
  const service = container.resolve<MarketplaceLinkModuleService>(MARKETPLACE_LINK_MODULE);
  const counters: LinkCounters = { created: 0, updated: 0, unchanged: 0 };

  const existing = (await service.listProductMarketplaceLinks({
    tenant_id: tenantId,
    marketplace: "wb",
  })) as unknown as {
    id: string;
    product_id: string;
    external_id: string;
    vendor_code: string | null;
    matched_by: string;
  }[];
  const byProduct = new Map(existing.map((row) => [row.product_id, row]));

  for (const { product_id, entry } of entries) {
    const stored = byProduct.get(product_id);

    if (
      stored &&
      stored.external_id === entry.nm_id &&
      (stored.vendor_code ?? null) === (entry.vendor_code ?? null) &&
      stored.matched_by === entry.matched_by
    ) {
      counters.unchanged += 1;
      continue;
    }

    if (stored) {
      counters.updated += 1;
      if (!options.dryRun) {
        await service.updateProductMarketplaceLinks({
          id: stored.id,
          external_id: entry.nm_id,
          vendor_code: entry.vendor_code,
          matched_by: entry.matched_by,
          linked_at: new Date(),
        });
      }
      continue;
    }

    counters.created += 1;
    if (!options.dryRun) {
      await service.createProductMarketplaceLinks({
        tenant_id: tenantId,
        product_id,
        variant_id: null,
        marketplace: "wb" as const,
        external_id: entry.nm_id,
        vendor_code: entry.vendor_code,
        matched_by: entry.matched_by,
        linked_at: new Date(),
      });
    }
  }

  return counters;
};
