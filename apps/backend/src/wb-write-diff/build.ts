import type { MedusaContainer } from "@medusajs/framework";
import { diffPrices, diffStocks } from "./diff";
import { readLinks, readMirrors, readStoreVariants, readWarehouseMappings } from "./read";
import type { WbDiffKind, WbDiffResult } from "./types";

/**
 * "What would change on WB" for one shop and one class
 * (w21-wb-write-stocks-prices).
 *
 * The one entry point the panel route, the `wb:push` script and the acceptance
 * fixtures all go through, so the screen and the dry run can never disagree
 * about the numbers.
 *
 * Reads only. The sole path from here to a socket is `wbWrite`, and it is shut
 * by the five gates of `modules/marketplace-write/execute.ts`.
 */

/**
 * The currency both sides are compared in.
 *
 * WB names it itself (`currencyIsoCode4217`, mirrored into
 * `wb_price.currency_iso`), and that is the number the diff must use: taking
 * the shop's own default instead would compare roubles with dollars and call
 * the difference a price change. A shop with no price in that currency gets
 * `store_price_absent` on every row, which is the honest outcome.
 */
export const diffCurrency = (
  prices: { currency_iso: string | null }[],
  fallback = "rub",
): string => {
  const named = prices
    .map((price) => String(price.currency_iso ?? "").trim().toLowerCase())
    .filter(Boolean);
  return named[0] ?? fallback;
};

export const buildWbDiff = async (
  container: MedusaContainer,
  options: { tenantId: string; kind: WbDiffKind },
): Promise<WbDiffResult> => {
  const { tenantId, kind } = options;

  const [mappings, links, mirrors] = await Promise.all([
    readWarehouseMappings(container, tenantId),
    readLinks(container, tenantId),
    readMirrors(container, tenantId, kind),
  ]);

  const currency = diffCurrency(mirrors.prices);

  const variants = await readStoreVariants(container, {
    tenantId,
    currency,
    stockLocationIds: mappings.map((mapping) => mapping.stock_location_id),
  });

  if (kind === "stocks") {
    const { rows, counts, warehouses } = diffStocks({
      variants,
      links,
      cards: mirrors.cards,
      stocks: mirrors.stocks,
      mappings,
    });

    return {
      kind,
      tenant_id: tenantId,
      rows,
      counts,
      unmapped_locations: mappings.filter((mapping) => !mapping.wb_warehouse_id),
      warehouses,
      mirror_fetched_at: mirrors.fetched_at,
    };
  }

  const { rows, counts } = diffPrices({ variants, links, prices: mirrors.prices });

  return {
    kind,
    tenant_id: tenantId,
    rows,
    counts,
    // A price is not kept per warehouse, so neither list means anything here.
    unmapped_locations: [],
    warehouses: [],
    mirror_fetched_at: mirrors.fetched_at,
  };
};
