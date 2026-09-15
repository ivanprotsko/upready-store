# {{TASK_ID}} — Enrich the tenant's EXISTING products from the WB mirror (titles, prices, characteristics, reviews, images) — local stand + exportable dataset

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Tenant `cherkashino` (Oksana's store; the same goods are sold on Wildberries under the seller "Фабрика Натуральных Продуктов"). Uses the merged w01 module `apps/backend/src/modules/wb/` and its mirrors `wb_product` (title, brand, vendor_code, photos, dimensions, sizes, raw with characteristics), `wb_price`, `wb_feedback`.

## Ivan's order (2026-09-16 04:44 WITA, verbatim, Russian)
> «Также обнови на сайте тенанта информацию с товарами которые сейчас там указаны (новые не добавляй), но заголовки, цены, характеристики и отзывы добавь, а также добавь картинки, но сохрани наши картинки, с белым чистым фоном которые стоят первыми в качестве обложки товара»

Meaning: for the products ALREADY in the tenant's catalog (create none), add from the WB card: the title, the price, the characteristics, the reviews, and the WB photos — while KEEPING our existing images: the current first image (clean white background) stays first, i.e. remains the cover/thumbnail; WB photos go after it. Nothing is deleted.

## What to build
1. **Link table** `product_marketplace_link` (tenant_id, product_id, variant_id nullable, marketplace='wb', external_id=nm_id, vendor_code, matched_by, linked_at) — the store's SKUs are the WB vendor codes (артикулы); match `product_variant.sku` (and `product.handle`/metadata if the SKU is missing) against `wb_product.vendor_code`; report matched / unmatched on both sides; unmatched products are NOT enriched and NOT created.
2. **Enrichment script** `pnpm --filter backend catalog:enrich-from-wb -- --tenant cherkashino --dry-run|--apply [--export <file.json>|--import <file.json>] [--only titles,prices,characteristics,reviews,images]`, idempotent (re-running changes nothing):
   - titles: product title ← WB card title (keep the old title in `product.metadata.title_before_wb` the first time);
   - prices: the variant price in RUB ← the price a WB buyer sees (say WHICH field of `wb_price`/the docs you took and why); the store's price set/region of the tenant is updated, no new currencies;
   - characteristics: WB card characteristics → the structure the storefront's `apps/storefront/src/modules/products/components/product-attributes` renders (read that component first; extend it if the shape differs, keep Geist tokens); Russian names as WB gives them;
   - reviews: `wb_feedback` → the `product-review` module (`apps/backend/src/modules/product-review`, fields author_name, rating, body, review_date, reply, status, source, source_key): source value for WB (add it to `REVIEW_SOURCES` with a migration if absent), `source_key = wb feedback id` for idempotency, status published, author = the display name WB shows, reply = the seller's answer if present; the storefront review block must show them;
   - images: download the WB card photos (the largest documented size), upload through the Medusa file service the backend is configured with (local provider without S3 — see `medusa-config.ts`), append AFTER the existing images, keep the existing first image as `thumbnail`; dedupe by source URL stored in image metadata; never delete or reorder existing images.
   - `--export` writes a dataset (links + titles + prices + characteristics + reviews + image source URLs, no secrets, no keys) so the LIVE host can be enriched by `--import` without holding the WB key (that is task d07 — do NOT touch the live host here).
3. Tests: matching (sku vs vendor_code, no false matches), idempotency (second `--apply` = 0 changes), cover preserved (first image id unchanged after images step), review dedupe by source_key.

## Measurements for the PR (local stand, tenant cherkashino)
- Matching table: N products in catalog, M matched, list of unmatched (both sides).
- Dry-run report, then `--apply`; counts per section (titles updated, prices updated, characteristics set, reviews imported, images added); second `--apply` prints zeros.
- Storefront screenshots BEFORE and AFTER for 3 products (product page: title, price, characteristics block, reviews block, gallery with our white cover first, WB photos after) — headed Playwright is fine; the live product is the local storefront of this stand.
- The exported dataset committed under `artifacts/docs/{{TASK_ID}}/dataset.json` (public data only), its size and counts.
- Ozon analogue (Ivan 04:44): name the Ozon Seller API methods that would supply the same five data sets (doc URLs from `https://docs.ozon.ru/api/seller/`), or "не найдено"; do not build.

Rules: no new products; nothing deleted; pg_dump of the local DB before `--apply` (path in the report); no WB writes (the module cannot); `git grep -n "eyJhbGci" -- .` empty; report.md + report.json per the preamble.
