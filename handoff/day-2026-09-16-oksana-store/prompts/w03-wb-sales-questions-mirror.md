# {{TASK_ID}} — WB read-only mirrors, part 2: sales, questions, seller analytics (+ panel tables)

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Builds on the merged w01 module `apps/backend/src/modules/wb/` (registry `endpoints.ts`, single I/O point `transport.ts` → `wbRead(endpointId, …)`, `sync.ts` kinds cards|prices|stocks|orders|feedbacks, models `wb_*`, script `pnpm --filter backend wb:sync`). Read its report first: `artifacts/docs/w01-wb-readonly-client/report.md` (sections 2, 5, 7) — it records the real rate limits of the tenant's `base` token (statistics: 1 request per 3 hours; feedbacks: 5 per hour) and the timeouts already tuned.

## Standing invariant (Ivan, 2026-09-16 02:46 WITA)
Only READS from Wildberries; every write is impossible by construction (registry allow-list, PUT/PATCH/DELETE unregistrable, POST only for documented reads with `readViaPost.docUrl`, single call site lint, fetch-spy tests). Keep all of that green; extend, never bypass. Key: `WB_API_KEY` in `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` (outside git) → `wb:seed-key`; never print it; before push `git grep -n "eyJhbGci" -- .` is empty.

## What to add (each read registered with its doc URL; unknown = not registered)
1. **Sales** — `statistics` sales endpoint (the sibling of the registered `statistics.orders`): mirror `wb_sale` (tenant_id, srid, nm_id, supplier_article, barcode, price fields, sale_date, last_change_date, warehouse/region, source='wb', fetched_at, raw). Sync kind `sales`, incremental by `dateFrom` = max(last_change_date).
2. **Questions** — customer questions endpoint (feedbacks domain, `isAnswered` two passes like feedbacks): mirror `wb_question` (id, nm_id, text, answer, state, created_date, was_viewed, …, raw). Sync kind `questions`.
3. **Seller analytics** — the nm-report / funnel endpoint (seller-analytics host, the base token's bit 2 "Access to Analytics" is set per `GET /tenants/wb/status`): mirror `wb_analytics_daily` (nm_id, date, open_card, add_to_cart, orders, ordered_sum, buyouts, … whatever the documented response holds) with the request period. Sync kind `analytics`.
4. **Finance report** (`reportDetailByPeriod`) — the `finance`/`statistics` host answered 403 on the staff probe with this token; test the documented endpoint ONCE, record the exact status in the report, register it only if it reads 200; otherwise document "недоступно с этим токеном (HTTP <code>)" and skip.
5. `WB_SYNC_KINDS` extended; `--kind all` order documented; every kind writes its `wb_sync_run` row; `wb_api_call` still logs only registered reads.
6. Tenant-panel Wildberries page: tables for sales (last 30 days, count + sum), questions (unanswered first), analytics (per-card funnel for the last 7 days) — same components as the existing endpoint/sync tables (`@medusajs/ui`, the page's own pattern; do not introduce a second design system).

## Rate limits are facts, not failures
Read the limits for each endpoint from the saved docs (`artifacts/docs/w01-wb-readonly-client/docs/*.txt`; anti-bot pages may be opened in Ivan's browser: Playwright `channel: 'chrome'`, `headless: false`, a profile dir under your scratchpad, no cabinet login). Respect `Retry-After`; when a limit blocks a pass, record the 429 and the wait in the report and the `wb_sync_run` row — do not loop. The statistics limit means `orders`/`sales` can be fetched once per 3 hours: plan your live measurement accordingly and do not burn the slot on retries.

## Measurements for the PR (local stand only, tenant `cherkashino`)
- `select count(*) from wb_sale / wb_question / wb_analytics_daily` after a real sync, the `wb_sync_run` rows, the `wb_api_call` rows of this run.
- Registry validator + fetch-spy tests green (list the new test names); the single-call-site lint green.
- Screenshot of the panel page with the three new tables.
- Ozon analogue (Ivan 04:44: design so we can check the same on Ozon): for each of the three data sets, name the Ozon Seller API method that would give the same data with its doc URL, or write "не найдено" — from `https://docs.ozon.ru/api/seller/` only; do not build it.

Report: `artifacts/docs/{{TASK_ID}}/report.md` + `report.json` per the preamble. Live host untouched.
