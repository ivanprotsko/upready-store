# Goal

Give the platform product reviews, and put the client's 332 existing reviews into her shop.

The feature does not exist at all today (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row
«Отзывы» — MISSING, and §6 gap 11). InSales has reviews as a basic property of a product card
(`{{MISSION_DIR}}/research/insales-combo-features.md`, id `otzyvy-na-tovary`), and a shop selling supplements
without a single review converts badly.

## What the client has

`{{MISSION_DIR}}/research/chrxnasdmds-digest.md` §6, row «Отзывы»:

- 332 reviews of her own products live in the source database as translation rows (resource `review`, ru and en,
  332 each) — `postgres://ivanprotsko@localhost:5433/medusa_chrxn`, psql at
  `/opt/homebrew/opt/postgresql@16/bin/psql`. The mapping from old product to new product is in
  `/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/02-mapping-registry.json`
  (rows of kind `product` carry `source_id`/`source_handle` and the target id).
- A much larger supplier archive exists (`docs/WB-data/wb_all_reviews.json`, 14 461 reviews) — **out of scope**:
  those are the supplier's reviews, not hers, and publishing them as hers would be a fabricated record.

## Step plan

1. **Model.** A review belongs to a tenant and a product: author name, rating 1–5, title, body, language, created
   date, status (`pending` / `published` / `hidden`), an optional link to the customer and to the order that
   proves the purchase, and a source marker (`shop`, `imported`). Put it in its own module under
   `apps/backend/src/modules/`, with a tenant link in `apps/backend/src/links/`, the same shape the existing
   tenant-scoped entities use.
2. **Storefront.** On the product page: the average rating and the count near the title, the list of published
   reviews with pagination, and a form for a logged-in customer. New reviews arrive as `pending`. A product with
   no reviews shows nothing at all rather than an empty widget. Add the `AggregateRating` to the existing
   product JSON-LD (`apps/storefront/src/modules/common/components/json-ld`) only when there is at least one
   published review, and never with an invented number.
3. **Panel.** A «Отзывы» section: list with filters by status and product, publish, hide, delete, and reply
   (the reply is shown under the review). Only the tenant's own reviews.
4. **Import script** under `apps/backend/src/scripts/` (or `apps/backend/scripts/`, matching where the migration
   scripts landed): reads the source rows, maps old product → new product through the mapping registry, writes
   them as `imported` and `published`, is idempotent (a second run creates nothing), takes `--dry-run`, and
   exits non-zero if any review cannot be mapped to a product. Reviews whose product is not in the shop are
   reported, not silently dropped: zero is a measurement (rule 20a).
5. **Moderation default.** A review from the storefront is `pending` until the owner publishes it. Say in the
   PR body whether an imported review is published immediately and why.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- On the local stand a customer leaves a review; it is invisible on the storefront until the owner publishes it
  in the panel, then it appears with the correct average. Three screenshots and the average computed by hand
  next to the one the page shows.
- The import script run against the source database maps and writes reviews; quote the counts it prints
  (mapped, written, unmapped and why), and the SQL count of source rows beside them. Running it a second time
  writes nothing — quote both runs.
- Another tenant's product page shows none of them. Quote the request.
- The product JSON-LD carries `aggregateRating` only where reviews exist. Quote both cases.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not import the 14 461 supplier reviews, and do not generate reviews with a model. A fabricated review is a
  fabricated record.
- Do not show a rating computed from zero reviews, and never default an empty average to 0 or to 5.
- Do not publish storefront reviews automatically without the owner's action.
- Do not deploy, and do not write to the live database.
