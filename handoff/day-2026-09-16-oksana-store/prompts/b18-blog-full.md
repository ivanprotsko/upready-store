# {{TASK_ID}} — Full blog («Журнал») for tenants: what Ivan sees on the live panel, then the missing pieces in panel, backend and storefront

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. Product code task (panel + backend + storefront). Read `handoff/day-2026-09-16-oksana-store/prompts/_ivan-0831.md` for the stand recipe and the owner login location.

## Ivan's order (2026-09-16 08:31 WITA, verbatim, Russian)
> «https://panel-store.upready.dev/journal - тут странный функционал с указанием адреса статей, с отсутствием страниц на которые бы можно было бы добавить сами статьи. Нужно сделать полноценный функционал блога.»

## What exists
- Backend: model `apps/backend/src/modules/tenant/models/tenant-article.ts` (slug, locale, title, excerpt, cover_url, markdown body …), API `apps/backend/src/api/tenants/articles/` (+ `[slug]`, `article-helpers.ts`, validators), store `apps/backend/src/api/store/tenant/articles/route.ts`.
- Panel: `/journal` (t10-blog) — `apps/tenant-panel/src/routes/journal/{article-list,article-edit}`, hook `hooks/api/articles.tsx`.
- Storefront: `apps/storefront/src/app/[locale]/(main)/journal/page.tsx` and `journal/[slug]/page.tsx`, rendering via `modules/content/components/markdown-content` (live https://cherkashino.shipshift.dev/ru/journal answers 200).
- Reference for mechanics: chrxnasdmds `apps/backend/src/modules/blog/` and its storefront article pages.

## Stage 0 — see what Ivan sees (deadline 30 minutes)
Log in to the LIVE panel https://panel-store.upready.dev with the owner account (file named in `_ivan-0831.md`; read-only look, create nothing on the live instance), screenshot `/journal` and the article edit page → `artifacts/docs/{{TASK_ID}}/before/`. Write `diagnosis.md`: what the UI offers vs a full blog, and why «адрес статьи» is visible without a way to write the article (a missing editor, a hidden field, an old build on the host — measured, not guessed; compare the live bundle with `origin/dev`).

## Build — the full blog
- Panel: article list with status filter and search; editor with markdown + live preview, cover upload and inline image upload through the existing uploads route, excerpt, category/tags, status draft/published/scheduled (publish_at), SEO title/description, slug auto-generated from the title and editable, per-locale variants, «open on the site» link; delete with confirmation.
- Backend: fields + migration (status, publish_at, category, tags, seo fields, author), published-only filtering in the store API, categories endpoint, sitemap entries, OG data.
- Storefront: journal list with pagination and category filter, article page (cover, date, reading time, body, related articles, share), OG/SEO tags, breadcrumbs — components and styles of THIS storefront (`@medusajs/ui` + tailwind), mechanics from the reference.
- Tests: backend integration tests for status filtering and slug rules, Playwright e2e (create in panel → visible on storefront; draft invisible), lint/typecheck green. Migration noted in the report for the deploy (pg_dump before apply).

## Acceptance
On the stand: an article created in the panel with cover, headings, an inline image, a list and a category, published → appears at `/ru/journal` and `/ru/journal/<slug>` with cover, date and OG tags; a draft is not visible; edit updates; delete gives 404 and drops it from the list; screenshots desktop 1280×900 and mobile 390×844; e2e green; `report.md` with `## Экономия`, `report.json` per the preamble.
