import type { MedusaContainer } from "@medusajs/framework";
import { ensureDefaultSchema } from "../product-attributes-fill/apply-default-schema";
import { DEFAULT_ATTRIBUTE_PRESET } from "../product-attributes-fill/default-schema";
import type { DatasetProduct, EnrichDataset } from "./dataset";
import { keyFromCatalogImage } from "./images";
import {
  type ApplyOptions,
  type SectionCounters,
  emptyCounters,
  type LiveProduct,
  loadLiveProducts,
  tenantProductIds,
} from "./apply/live";
import { type LinkCounters, writeLinks } from "./apply/links";
import { loadSchema, applyCharacteristics } from "./apply/characteristics";
import { applyTitle, applyPrice } from "./apply/title-price";
import { applyReviews } from "./apply/reviews";
import { applyImages } from "./apply/images";

/**
 * Writing one dataset into one shop's catalog (w07-tenant-catalog-enrich).
 *
 * Five sections, each independent and each idempotent: a second `--apply`
 * reports zeros. What the run must NEVER do is spelled out in Ivan's order of
 * 2026-09-16 04:44 WITA and enforced here rather than in a runbook:
 *
 *   - it creates no product and deletes nothing;
 *   - the shop's own first image stays first and stays the `thumbnail`;
 *   - it writes only to products the link table already ties to a card.
 *
 * Each section lives in its own file in `apply/` (t-2026-10-14-55).
 */

export { SECTIONS, emptyCounters, loadLiveProducts, tenantProductIds } from "./apply/live";
export type { Section, ApplyOptions, SectionCounters, LiveProduct } from "./apply/live";
export { loadSchema, applyCharacteristics } from "./apply/characteristics";
export type { SchemaCache } from "./apply/characteristics";
export { WB_REVIEW_LANGUAGE, reviewsToCreate } from "./apply/reviews";
export { writeLinks } from "./apply/links";
export type { LinkCounters } from "./apply/links";

export type ApplyResult = {
  counters: SectionCounters;
  links: LinkCounters;
  /** Handles the dataset names and this catalog does not hold. */
  missing_handles: string[];
};

/**
 * The whole enrichment of one shop from one dataset.
 *
 * The order of the sections is the order a person reads a product page in, and
 * they do not depend on each other: `--only images` on a catalog whose titles
 * were never touched does exactly the image step.
 */
export const applyDataset = async (
  container: MedusaContainer,
  tenant: { id: string; handle: string },
  dataset: EnrichDataset,
  options: ApplyOptions,
): Promise<ApplyResult> => {
  const counters = emptyCounters();
  const missing: string[] = [];

  const live = await loadLiveProducts(
    container,
    await tenantProductIds(container, tenant.id),
  );

  const pairs: { product: LiveProduct; entry: DatasetProduct }[] = [];
  for (const entry of dataset.products) {
    const product = live.get(entry.product_handle);
    if (!product) {
      missing.push(entry.product_handle);
      continue;
    }
    pairs.push({ product, entry });
  }

  const links = await writeLinks(
    container,
    tenant.id,
    pairs.map(({ product, entry }) => ({ product_id: product.id, entry })),
    options,
  );

  if (options.sections.has("characteristics") && !options.dryRun) {
    await ensureDefaultSchema(container, tenant.id);
  }
  const schema = options.sections.has("characteristics")
    ? await loadSchema(container, tenant.id)
    : { byKey: new Map(), optionsByAttribute: new Map(), nextPosition: 0 };

  // A dry run on a shop whose schema is still empty has to say what the run
  // WOULD fill. Without this stub every preset value is reported as «не
  // принято», which reads as a broken card rather than as a schema the apply
  // creates a second later (measured 2026-09-16: 39 of 102 characteristics on
  // the first dry run of the stand). The ids are never dereferenced: every
  // write below exits early under `--dry-run`.
  if (options.sections.has("characteristics") && options.dryRun) {
    for (const preset of DEFAULT_ATTRIBUTE_PRESET) {
      if (!schema.byKey.has(preset.key)) {
        schema.byKey.set(preset.key, {
          id: "(ещё не создана)",
          key: preset.key,
          type: preset.type,
          name: preset.name,
        });
      }
    }
  }

  for (const { product, entry } of pairs) {
    if (options.sections.has("titles")) {
      await applyTitle(container, product, entry, options, counters);
    }
    if (options.sections.has("prices")) {
      await applyPrice(container, product, entry, options, counters);
    }
    if (options.sections.has("characteristics")) {
      await applyCharacteristics(container, tenant.id, schema, product, entry, options, counters);
    }
    if (options.sections.has("reviews")) {
      await applyReviews(container, tenant.id, product, entry, options, counters);
    }
    if (options.sections.has("images")) {
      await applyImages(container, tenant.id, product, entry, options, counters);
    }
  }

  return { counters, links, missing_handles: missing };
};

/** Re-exported so the script can report what the dedupe recognised. */
export { keyFromCatalogImage };
