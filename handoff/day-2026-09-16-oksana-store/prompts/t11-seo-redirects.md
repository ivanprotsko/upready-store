# Goal

Three things a shop needs the day it changes address, in one PR: editable meta fields, a sitemap that belongs to
the shop, and per-page 301 redirects from the old store's URLs.

State today (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «SEO», §6 gap 13): canonical and
hreflang work on the shop's own address, `sitemap.ts`, `robots.ts`, `llms.txt` and product JSON-LD exist, but
there are no meta title/description fields on products, categories or pages, and no redirect table.

## Why the redirects matter today

The client's old shop lives at `olavka.ru` and is paid until 2027-07-19; her new domains
`cherkashino.ru` / `черкашино.рф` were bought on 2026-09-03. The old-to-new URL table for all 38 products and
9 categories already exists, computed during the migration:
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/02-mapping-registry.md`
(and the same data in `02-mapping-registry.json`), in the form
`https://olavka.ru/ru/ru/products/<handle>` → `/<locale>/products/<handle>-cherkashino`.
The policy for canonical addresses is `specs/tenant-address/CANONICAL.md` in this repository — read it before
you design anything, and follow it.

## Step plan

1. **Meta fields.** Add `seo_title` and `seo_description` (per locale) to products, categories and tenant pages.
   Medusa has no such fields, so use the entity `metadata` where it fits and the tenant's own tables where it
   does not; whichever you choose, the panel edits them and the storefront renders them in `<head>`, falling
   back to the existing title and the first sentence of the description when empty. Show the owner the rendered
   length next to the field so they can see when a title is too long.
2. **Slug control.** The owner can edit a product's or a category's handle, and changing it leaves a 301 from
   the old handle. A handle that collides with an existing one is rejected with a message, not silently
   suffixed.
3. **Per-tenant sitemap and robots.** `sitemap.xml` of a shop lists only that shop's products, categories, pages
   and (once `t10-blog` lands, if it has) articles, with their real `lastmod`. `robots.txt` points at that
   sitemap. Verify on two tenants that neither leaks into the other.
4. **Redirect table.** A tenant-scoped list of `from path` → `to path` + status (301 by default), editable in the
   panel, applied by `apps/storefront/src/middleware.ts` before the locale logic, with a loop guard and a cap on
   the number of hops. Matching is on the path, so it works for every host the tenant answers on.
5. **Import the client's table.** A script that reads `02-mapping-registry.json` and writes the 47 redirects for
   the `cherkashino` tenant, idempotent, `--dry-run`, reporting anything it cannot map. The source URLs carry
   the old double prefix `/ru/ru/...`; handle that explicitly rather than by a regex that happens to work.
6. **Search-engine verification.** A field where the owner pastes the Yandex and Google verification meta tag,
   rendered in `<head>` of their shop only.

## Commands

```
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build && pnpm test
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
```

## Acceptance (measured, quoted in the PR body)

- The owner sets a meta title and description on a product; `curl -s <product url> | grep -o '<title>.*</title>'`
  and the meta description show them. Quote both.
- `curl -I http://<handle>.localhost:8041/ru/ru/products/<old handle>` returns `301` with the expected
  `Location`. Quote three different redirects from the imported table, including one category.
- Two tenants' sitemaps contain disjoint URL sets; quote the counts and one URL from each.
- A redirect loop (`a → b`, `b → a`) does not hang the request: quote the status code the guard produces.
- The import script reports 47 redirects written, then zero on a second run. Quote both.

## What NOT to do

- Do not redirect anything on a host you do not control, and do not touch DNS: the old domain's DNS is
  `x02-domains`, and the redirects here are what the platform serves once traffic arrives.
- Do not add hreflang for all 36 locales on a shop that has enabled two.
- Do not invent `lastmod` values: use the real update timestamps.
- Do not deploy.
