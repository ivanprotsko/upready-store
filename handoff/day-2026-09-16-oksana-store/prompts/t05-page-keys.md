# Goal

Let a shop owner publish any page they need, not only the five the model allows today.

`apps/backend/src/modules/tenant/models/tenant-page.ts:11` says:

```ts
export const TENANT_PAGE_KEYS = ["contacts", "legal", "about", "privacy", "offer"] as const;
```

Because of that line, ten of the client's pages could not be carried over at all — `delivery`, `faq`,
`wholesale`, `returns`, `consent`, `consent-marketing`, `return-memo` in Russian and three of them in English.
Their texts exist and are listed as «pending» in the migration report
(`/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`,
section «Не перенесено», last paragraph). A shop without a delivery page and a returns page cannot take real
customers.

## Step plan

1. Replace the closed key list with a free slug plus a title, keeping the five existing keys working exactly as
   they do now (they are referenced by the footer, by the storefront routes and by the seam tests). The five
   become reserved slugs with their current meaning; anything else is the owner's own page.
   A slug is lowercase latin letters, digits and hyphens, 2 to 48 characters, unique per tenant.
2. Write the migration for the model change, and take a `pg_dump` before you run it on any database that is not
   a throwaway.
3. Panel `apps/tenant-panel/src/routes/pages`: create a page with a slug and a title, edit the markdown, publish
   or unpublish, delete, and choose whether the page appears in the footer. Show the resulting public URL next to
   the slug field so the owner sees what they are making.
4. Storefront `apps/storefront/src/app/[locale]/(main)/pages/[key]` serves any published slug of the tenant and
   returns the real 404 page for an unknown one. The footer lists the pages the owner marked for it, in the
   order they set, in the visitor's language.
5. Revalidation: a saved page must appear on the storefront without a rebuild, through the existing
   `tenant.pages` revalidation path (`apps/backend/src/api/tenants/pages/**` → `POST /api/revalidate`).
6. Seam tests: extend `apps/backend/integration-tests/http/tenants-pages.spec.ts` — a custom slug round-trips,
   a reserved slug still behaves as before, an invalid slug is rejected with 400, and another tenant's slug is
   not visible.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- On the local stand the owner creates a page with slug `delivery` and a Russian title, publishes it, and
  `http://<handle>.localhost:8041/ru/pages/delivery` returns 200 with that text. Quote the curl and screenshot
  the page.
- The same page appears in the footer, and an unpublished one does not. Two screenshots.
- `/ru/pages/about` (a reserved key) still works unchanged. Quote it.
- An unknown slug returns the storefront 404, not a crash. Quote the status code.
- The seam suite passes; quote the whole file's `ℹ fail` line.

## What NOT to do

- Do not break or silently rename the five existing keys: other tasks and live tenants depend on them.
- Do not add a WYSIWYG editor: markdown is the format, the same as today.
- Do not write the client's legal texts here. Filling them is `x01-tenant-live-import` (import) and
  `t12-legal-requisites` (requisites). Your job is that the keys exist.
- Do not run a migration against the live database, and do not deploy.
