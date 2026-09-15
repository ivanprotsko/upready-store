# {{TASK_ID}} — Marketplace integration spec: Wildberries + Ozon, measured against InSales Combo

You are a research-and-design worker. Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. This task ships DOCUMENTS and a TASK BREAKDOWN — no product code. Your PR to `{{BASE}}` may contain only files under `handoff/day-2026-09-16-oksana-store/` and `artifacts/docs/{{TASK_ID}}/`.

## Ivan's order (2026-09-16 04:41 WITA, verbatim, Russian)

> «подтверждаю, что магазин "Фабрика натуральных продуктов" это правильный магазин, документацию открывай через мой браузер и смотри сам. Учти что скоро я дам ключ и под ozon, поэтому проектировать можно сразу с четом того, что он будет. Что проектировать смотри в документации озон и в первую очередь на то что есть у конкурента https://www.insales.ru/page/combo.»

Meaning: the WB seller cabinet is confirmed as Oksana's ("Фабрика Натуральных Продуктов", ИП Черкашина, ИНН 524900658999). An Ozon Seller API key arrives soon — design the marketplace layer for BOTH marketplaces now. What to build is defined by (1) what the competitor InSales Combo offers and (2) what the Ozon and WB APIs actually expose. Documentation behind anti-bot may be opened in Ivan's browser (see "Browser" below).

Standing invariant (Ivan, 2026-09-16 02:46 WITA): marketplace APIs are READ-ONLY for us in this phase. We read marketplace data into our local DB; no write to WB or Ozon is ever performed. Any write capability is designed on paper as a separate, explicitly switched layer and is NOT built.

## What already exists (read before writing)

- WB read-only client — PR #71 `feat/day16-wb-readonly-client` (task w01). Code: `apps/backend/src/modules/wb/` (`endpoints.ts` registry of allowed reads, `transport.ts` single I/O point `wbRead(endpointId, …)`, `sync.ts` kinds cards|prices|stocks|orders|feedbacks, models wb_product/wb_price/wb_stock/wb_order/wb_feedback/wb_sync_run/wb_api_call, `token.ts` inspection), key in tenant-secrets, `GET /tenants/wb/status`, tenant-panel page "Wildberries". Read it at the PR (`gh pr view 71`, `gh pr diff 71`) or on `origin/dev` once merged. Its report: `artifacts/docs/w01-wb-readonly-client/report.md` in that branch — section 7 lists what is NOT done.
- Saved WB doc pages (text): `artifacts/docs/w01-wb-readonly-client/docs/*.txt` in PR #71 (item-management, reports, customer-communication, api-information).
- Older WB raw corpus (2026-09-04, saved via Ivan's browser): `/Users/ivanprotsko/projects/lab/docs/research/raw/2026-09-04-wb-api/` (README.md lists pages: token types, sandbox, FBS/DBS/DBW orders, data categories).
- InSales Combo inventory already collected: `handoff/day-2026-09-16-oksana-store/research/insales-combo-features.md` (15 pages, 2026-09-15). Gap matrix of the store vs Combo: `research/gap-matrix.md`; store capabilities: `research/upready-store-capabilities.md`; WB task plan draft: `research/wb-plan.md`.
- Store facts: the store's SKUs are the WB/Ozon vendor codes (артикулы) of the same goods; tenant handle `cherkashino`; storefront `apps/storefront`, seller panel `apps/tenant-panel` (Geist design system), backend Medusa v2 `apps/backend`.

## Sources to read (cite every claim with URL + saved copy)

1. InSales Combo: `https://www.insales.ru/page/combo` and `https://www.insales.ru/page/marketplace` — live, plus the inventory above. Extract the marketplace feature list precisely: catalog/cards export, stock sync, prices, orders per scheme (FBS/FBO/DBS), reviews & questions, chats, analytics, promotions, returns, documents/finance.
2. Ozon Seller API: `https://docs.ozon.ru/api/seller/` (auth headers Client-Id + Api-Key, rate limits, the product/price/stock/posting(FBS/FBO)/finance/review/question/chat/analytics method groups, which methods are READS). Verify what fetches from CLI; if the site blocks non-interactive clients, use the browser (below). If Ozon offers a sandbox/test contour, cite the page; otherwise write "unknown".
3. Wildberries: the saved pages above; gaps — `https://dev.wildberries.ru/` via the browser. OpenAPI mirror as a secondary source: `https://github.com/eslazarev/wildberries-sdk/tree/main/specs`.
4. Our code (PR #71) for the contract that already exists.

## Browser (Ivan's permission, 04:41)

`dev.wildberries.ru` (and possibly docs.ozon.ru) answers HTTP 498 anti-bot to curl, WebFetch and headless browsers. Ivan explicitly allowed opening the documentation in his browser. Do it with Playwright launching the installed Google Chrome in HEADED mode: `chromium.launchPersistentContext('<your scratchpad>/chrome-profile', { channel: 'chrome', headless: false })`. Rules: a dedicated profile dir under your scratchpad — never Ivan's own Chrome profile directory; no login to any marketplace cabinet, no captcha automation beyond loading the page and waiting; windows appearing on the screen are expected (Ivan is asleep and allowed it); close the browser when done. Save every page you rely on as text (`innerText`) plus its link list under `artifacts/docs/{{TASK_ID}}/docs/<host>-<path>.txt` with the URL and the date on the first line — the spec cites these files, not memory. No docker, no VMs.

## Deliverables

1. `handoff/day-2026-09-16-oksana-store/research/marketplace-spec.md` (Russian, for Ivan). Sections, in this order:
   - **Планка InSales Combo** — parity matrix: one row per marketplace feature Combo advertises; columns: Combo has / upready-store has now (after PR #71) / planned task id / marketplace API that makes it possible (WB method, Ozon method, doc URLs). Mark honestly: есть / частично / нет / невозможно без записи в маркетплейс.
   - **Архитектура** — one `marketplace` core in `apps/backend/src/modules/marketplace/` with per-marketplace adapters (`wb` = the existing module, `ozon` = new), a shared adapter contract (read-only transport with a per-marketplace allow-list registry exactly like `endpoints.ts`, `inspectCredentials`, sync kinds, mirror writers), raw mirrors per marketplace (`wb_*` exist; `ozon_*` to add: product, price, stock, posting/order, review, question, sync_run, api_call) and a normalized layer `mp_product`, `mp_offer` (price+stock per warehouse), `mp_order`, `mp_review` keyed by `(tenant_id, marketplace, external_id)` and linked to the store's product/variant by vendor code; a scheduler (cron per tenant per kind, backoff on 429); tenant-panel section «Маркетплейсы» (list of connections, status per marketplace, last sync, counts, errors) reusing the Wildberries page pattern. State explicitly which parts of the WB module move/rename and which stay. Read-only invariant restated as code rules (registry validator, single-call-site lint per adapter, fetch-spy tests).
   - **Ozon: что нужно от Ивана** — exact names of the credentials we will read from `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` (`OZON_CLIENT_ID`, `OZON_API_KEY` — names only, the file is outside git), the permission set the key needs (from the docs), whether a read-only key exists on Ozon (cite or "unknown").
   - **Фаза записи (не строим)** — one short section: which InSales Combo features require WRITING to marketplaces (stock push, price push, order status, answers to reviews) and how the design keeps them behind an explicit per-tenant switch later.
   - **Разбивка на задачи** — a table of tasks with dependencies and order.
2. `handoff/day-2026-09-16-oksana-store/research/marketplace-tasks.json` — an ARRAY of dispatcher task objects, the same shape as entries in `handoff/day-2026-09-16-oksana-store/tasks.json` (fields: id, title (Russian), kind "build", lane "build", model "opus", effort "high", branch `feat/day16-<id>`, deps, softDeps, priority, prompt `<id>.md`, acceptance (Russian, measurable on origin/dev and the LOCAL stand), why, source). Ids start at `w11-…` (w01–w10 are taken). Size each task for one worker session (3–4 hours). Include at least: `w11-ozon-readonly-client` (transport + registry + tests + `ozon_*` mirrors + `ozon:sync` script that runs once the env vars appear, with tests using recorded/mocked responses shaped by the docs), `w12-marketplace-core` (normalized `mp_*` layer, adapter contract, WB module wired through it, panel section «Маркетплейсы»), and the follow-ups the parity matrix demands (orders desk, reviews/questions desk without sending, analytics dashboard, catalog link by vendor code, …).
3. `handoff/day-2026-09-16-oksana-store/research/marketplace-prompts/<id>.md` — an English worker prompt draft for every task in the JSON, in the style of `prompts/w01-wb-readonly-client.md` (order → sources → what to build → measurements to include in the PR → report). Mention env var NAMES only, never values.
4. `artifacts/docs/{{TASK_ID}}/report.md` and `report.json` per the preamble; the JSON's "where to look" links point at the spec and the task file.

## Rules of evidence

- Every API fact (method, path, header, limit, sandbox) carries the doc URL and the saved copy path. Nothing from memory: if a page could not be opened, write "не удалось открыть" with the HTTP status.
- Do not invent Ozon or WB behaviour to fill the matrix; "unknown" is a valid cell.
- Do not touch `apps/*`, do not run migrations, do not call any marketplace API (no keys in this task).
- Before push: `git grep -n "eyJhbGci" -- .` and `git grep -n -E "OZON_API_KEY=|WB_API_KEY=" -- .` must print nothing.
