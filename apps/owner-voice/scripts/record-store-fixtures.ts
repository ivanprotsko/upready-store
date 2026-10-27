/**
 * Records the public Store API of the shop into fixtures/shop/assistant-*.json
 * for the buyer assistant's tests and screens.
 *
 *   node scripts/record-store-fixtures.ts
 *
 * It goes through the same GET-only client as the stand (`src/shop/api.ts`),
 * reads only `/store/*` with the publishable key every storefront gets, and
 * writes the answers with that key left out. No login, no `/tenants/*`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readConfig } from "../src/config.ts";
import { HttpShopApi } from "../src/shop/api.ts";

const config = readConfig({});
const shop = new HttpShopApi({ ...config.shop, login: null }, { store: fetch, owner: fetch });
const dir = fileURLToPath(new URL("../fixtures/shop/", import.meta.url));
const stamp = { source: `${config.shop.apiUrl} for ${config.shop.host}, GET /store/* with the public publishable key (left out)`, recorded: new Date().toISOString() };

const regionId = await shop.regionId();
const save = (file: string, body: unknown) => {
  writeFileSync(`${dir}${file}`, `${JSON.stringify({ _fixture: stamp, ...(body as object) }, null, 2)}\n`);
  console.log(`wrote fixtures/shop/${file}`);
};

save(
  "assistant-store-products.json",
  await shop.store("/store/products", {
    region_id: regionId ?? undefined,
    limit: 60,
    fields:
      "id,title,handle,subtitle,description,*categories,*variants.calculated_price,variants.title,variants.sku,variants.manage_inventory,variants.allow_backorder,+variants.inventory_quantity",
  }),
);
save("assistant-store-categories.json", await shop.store("/store/tenant/product-categories", { limit: 100, fields: "id,name,handle,parent_category_id" }));
const pages = (await shop.store("/store/tenant/pages")) as { pages?: { key: string }[] };
save("assistant-store-pages.json", pages);
const bodies: Record<string, unknown> = {};
for (const page of pages.pages ?? []) bodies[page.key] = await shop.store(`/store/tenant/pages/${encodeURIComponent(page.key)}`);
save("assistant-store-page-bodies.json", { pages: bodies });
