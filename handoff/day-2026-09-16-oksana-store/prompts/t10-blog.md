# Goal

Give the platform a journal, and put the client's 18 existing articles into her shop.

The feature does not exist (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Блог» — MISSING,
§6 gap 12). It is not a nice-to-have here: the whole shape of this shop, as agreed with the client, is a
«магазин-журнал» whose articles bring search and AI traffic
(`{{MISSION_DIR}}/research/telegram-digest.md`, #460352, and §3 «Страницы / контент»). InSales lists «Блог и
статьи» under SEO and content (`insales-combo-features.md`, id `blog-i-stati`).

## What the client has

`{{MISSION_DIR}}/research/chrxnasdmds-digest.md` and the migration report: 18 published articles (9 ru + 9 en)
in the source `article` table of `postgres://ivanprotsko@localhost:5433/medusa_chrxn`, listed in the migration
registry as dataset `articles`, status pending. Also on disk, as a separate and lower-quality source, 45 MDX
drafts (`/Users/ivanprotsko/upready/projects/chrxnasdmds/.ai/drafts/articles/`) and 39 outlines in
`apps/backend/src/data/pages.json` — **do not publish drafts as articles**; only the 18 published ones.

## Step plan

1. **Model.** An article belongs to a tenant: slug (unique per tenant), locale, title, excerpt, cover image,
   markdown body, status (`draft` / `published`), published date, optional tags, and SEO title/description.
   Own module under `apps/backend/src/modules/`, tenant link in `apps/backend/src/links/`, the shape the other
   tenant-scoped entities already use. One article exists per locale; a slug with no text in the visitor's
   language falls back the way tenant pages do (language → `en` → any), not to a 404.
2. **Storefront.** `/[locale]/journal` — the feed with cover, title, excerpt and date, paginated;
   `/[locale]/journal/[slug]` — the article, with `Article` JSON-LD, og image from the cover, and canonical.
   Both render inside the tenant's theme. Add the journal to the site navigation only when the shop has at
   least one published article.
3. **Sitemap.** Published articles join `apps/storefront/src/app/sitemap.ts` for that tenant, and only for that
   tenant.
4. **Panel.** A «Журнал» section: list, create, edit (markdown, the same editor style the pages screen uses),
   cover upload through the existing tenant upload route, publish/unpublish, delete, and the per-locale text.
5. **Import script** under the same directory as the other migration scripts: reads the 18 source articles,
   writes them for the tenant with their slugs and dates preserved, keeps ru and en as two locale rows of one
   article, is idempotent, takes `--dry-run`, and reports what it could not carry rather than dropping it.
   Images referenced inside an article body must be re-hosted to the tenant's uploads, or the article must be
   reported as carrying a dead link — never leave a body pointing at the old host without saying so.
6. **Revalidation.** A published article appears on the storefront without a rebuild, through the same
   revalidation path the pages use.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- On the local stand the owner writes an article in the panel, publishes it, and it opens at
  `http://<handle>.localhost:8041/ru/journal/<slug>` with the cover and the text. Screenshots of the panel, the
  feed and the article at 1280x900 and 390x844.
- The import script carries the 18 source articles; quote the counts (read, written, skipped and why) beside the
  SQL count of `article` in the source. A second run writes nothing.
- The article is present in `/sitemap.xml` of that tenant and absent from another tenant's. Quote both.
- An unpublished article returns 404 on the storefront. Quote the status.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not publish the 45 MDX drafts or the 39 outlines: they were never reviewed by the client.
- Do not generate article text with a model. The articles are hers.
- Do not build an AI article generator here — it was promised separately and is not in today's scope.
- Do not deploy, and do not write to the live database.
