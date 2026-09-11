# Piece 7: content pages (`/pages/**`) + storefront pages and footer links

Piece id `mt2-piece-7`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-pages`
(branch `feat/mt-panel-2-pages`). Ports: backend 9033, panel 5187, seam PORT 9046, storefront 8011.
Read `artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 7".
Model `tenant_page` exists (`modules/tenant/models/tenant-page.ts`, `TENANT_PAGE_KEYS`).

Build, checking `tsc` after each step:
1. Backend: `GET /tenants/pages`, `GET/PUT /tenants/pages/:key` (zod validator in
   `tenants/validators.ts`; upsert via the tenant module service `listTenantPages`/`createTenantPages`/
   `updateTenantPages`, tenant_id from `getTenantScope`); public `GET /store/tenant/pages` and
   `GET /store/tenant/pages/:key` through `api/store/tenant/resolve-tenant.ts` (create it if piece 5 has
   not landed in your worktree: publishable key context → sales channel → tenant via the
   tenant-sales-channel link). Matchers under `// ---- piece 7`.
2. Panel: own screens under `routes/pages/page-list` and `routes/pages/page-edit` built from the copied
   Admin primitives (`Container`, `Heading`, `DataTable` or a plain `Table`, `RouteDrawer`/`RouteFocusModal`,
   `Form`, `Textarea`, `Switch`, `Button`, toast) — plain-language labels ("Contacts", "Legal details",
   "About the shop", "Privacy policy", "Public offer"; status words Published / Draft / Empty); wire
   `/pages` and `/pages/:key` at the piece-7 anchor; hooks `pages.tsx`.
3. Storefront (`apps/storefront`, start it with
   `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9033 NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<Acme key from GET /tenants/me> NEXT_DIST_DIR=.next-p7 corepack pnpm exec next dev --turbopack -p 8011 > /tmp/p7-storefront.log 2>&1 &`):
   `lib/data/tenant-pages.ts` (`fetchWithoutLocale`, cache tags `tenant-pages`),
   `app/[locale]/(main)/pages/[key]/page.tsx` (title + body; render markdown paragraphs/headings/lists/
   links with a small own renderer under `lib/util/markdown.ts` — no new dependency; escape HTML),
   footer link column "Information" listing published pages in every footer variant that renders
   link lists (`modules/layout/templates/footer/**`), `api/revalidate` accepting `tenant.pages`.
   UI strings go through next-intl: add keys to ALL 36 `messages/*.json` (run the parity check from
   AGENTS.md).
4. Seam tests (`tenants-pages.spec.ts`): PUT by A → GET list shows it; B's list has it empty; store
   GET with A's key returns it when published and 404 when not; with B's key 404.
5. e2e + storefront: Acme fills "Contacts" and publishes from the panel; after
   `POST http://localhost:8011/api/revalidate {"type":"tenant.pages"}` the page is at
   `/en/pages/contacts` and the footer links to it; restart the storefront with Globex's key and prove
   the page is 404 there. `tsc` + `next lint` in `apps/storefront` rc 0.
6. Screenshot pairs: `pages`, `page-edit` (panel only — there is no Admin counterpart; shoot the
   Admin's `/app/settings/store` beside it to show the shared shell), plus `storefront-page-contacts.png`
   and `storefront-footer.png`.
