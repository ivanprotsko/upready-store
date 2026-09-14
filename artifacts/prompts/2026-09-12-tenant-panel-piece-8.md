# Piece 8: home page settings (`/home-settings`) + storefront home from the tenant document

Piece id `mt2-piece-8`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-home`
(branch `feat/mt-panel-2-home`). Ports: backend 9034, panel 5188, seam PORT 9047, storefront 8012.
Read `artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 8"
(the document schema `upready.tenant-home/v1` is the law; `settings` is VERBATIM
`apps/storefront/src/lib/theme/composition.ts` — read that file and
`apps/backend/src/api/store/storefront-settings/validation.ts` before coding). Model
`tenant_home_config` exists.

Build, checking `tsc` after each step:
1. Backend: `GET/PUT /tenants/home` (zod for `theme`/`content`, reuse `validate()` from
   `api/store/storefront-settings/validation.ts` for `settings`; `category_id` must be an owned category
   through the tenant-product-category link; upsert via the tenant module service; server stamps
   `updatedAt`), public `GET /store/tenant/home` via `api/store/tenant/resolve-tenant.ts` (EXISTS in trunk; create the
   helper if absent: publishable key context → sales channel → tenant). Matchers under `// ---- piece 8`.
2. Panel: own screen `routes/home-settings` from the copied Admin primitives: theme preset select
   (labels: Medusa default, Ferrite, Geist, Long Morning, Kerbstone, Scruple, Larchant — transcribe
   `THEME_LABELS`), the six composition selects with plain-language labels (transcribe the English
   texts of `.ai/strings/C1.json` if present in the storefront tree, else the mockup vocabulary in
   `artifacts/docs/2026-09-09-panel-composition-mockup.md` §C1), forbidden pairs greyed with the reason,
   hero fields (title, subtitle, CTA label, CTA link, image URL with the panel's upload widget →
   `/tenants/uploads`), products source (Popular / Products of a category + category combobox from
   `/tenants/product-categories`), block order (three rows with up/down), Save with toast. Every
   raw enum reaches the screen only through a label map (rule 18e). Wire `/home-settings` at the
   piece-8 anchor; hooks `home.tsx`.
3. Storefront (start:
   `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9034 NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<Acme key> NEXT_DIST_DIR=.next-p8 corepack pnpm exec next dev --turbopack -p 8012 > /tmp/p8-storefront.log 2>&1 &`):
   `lib/data/tenant-home.ts` (`fetchWithoutLocale`, tag `tenant-home`, revalidate type `tenant.home`);
   `(main)/page.tsx` uses the tenant document when present: `home.settings` replaces
   `getStorefrontSettings()`, blocks render in `content.order`, the hero variant receives
   `content.hero` (add optional props `title/subtitle/ctaLabel/ctaHref/imageUrl` to the K hero and to
   the G/H heroes where they show a headline — keep defaults when absent), the listing variant reads
   `content.products` (popular = current lead-collection logic; category = `listProducts` filtered by
   `category_id`). `app/layout.tsx`: `data-theme` from `home.theme.preset`, `data-mode` from
   `home.settings.defaultMode` when the document exists (piece 9 later moves this to request headers;
   keep the read in one helper `lib/data/tenant-home.ts` so it can be swapped). Nav/Footer keep reading
   `getStorefrontSettings()` unless the tenant document exists — route them through the same helper.
   `tsc` + `next lint` rc 0; UI strings via next-intl (36 catalogs, parity check).
4. Seam tests (`tenants-home.spec.ts`): PUT valid → GET returns it with `updatedAt`; forbidden pair
   (`footer: f6` + `defaultMode: dark`) → 422; foreign `category_id` → 400; B's GET is null after A's
   PUT; store GET with A's key = A's document, with B's key null.
5. e2e + storefront: Acme sets preset Kerbstone, hero title "Night wave hero", products = category
   from piece 5 (or Popular if no category exists), order products → categories → hero; after
   `POST /api/revalidate {"type":"tenant.home"}` on :8012 the home shows the title and the order;
   Globex's key on the same storefront (restart with its key) shows the untouched default.
6. Screenshot pairs: `home-settings` (panel; Admin `/app/settings/store` beside it), plus
   `storefront-home-acme.png` before/after.
