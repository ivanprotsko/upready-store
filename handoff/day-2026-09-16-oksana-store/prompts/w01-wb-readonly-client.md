# WB Seller API — a client that is READ-ONLY BY CONSTRUCTION, mirror tables, first import of the cabinet

## Ivan's order (2026-09-16 02:46 WITA, verbatim, Russian)
«…мне только что передали ключи для WB API и Yandex ID, поэтому можно будет сделать авторизацию и начать выполнение
функционала по WB API, и важно предусмотреть что если ассистент создававший ключи по ошибке выдал права не только на
чтение, а еще и на запись, то исключить ситуацию что какая-то запись будет выполнена на WB. Данные мы можем только
читать и записывать в нашу локальную БД, на всякий случай, чтобы у нас был свой источник для тестирования.»

Translation of the invariant: the key MAY carry write rights by mistake. Therefore **no code path in this repository
may ever send a mutating request to Wildberries**, and that impossibility must be enforced by code and proven by a
test — not by a comment, not by a config flag, not by trust in the token's scope. Data flows in ONE direction:
WB → our local database. The local mirror is our own test data source.

## The key (never copy its value anywhere)
- File: `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` — the MAIN checkout root, outside git
  (`.git/info/exclude`). It is NOT in your worktree and must not be copied into it. Variable: `WB_API_KEY` (a JWT).
- Load it only into the process environment of a local run: `set -a; source /Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino; set +a`
  in the shell before `medusa develop` / a script. The value never enters: `.env` files under git, logs, test
  fixtures, the PR body, `report.json`, screenshots. Before `git push`: `git grep -n "eyJhbGci" -- .` must print nothing.
- Other lines of that file (Yandex ID, a personal account under `# WEB`) are not for this task: do not read them into anything.

## What the staff already measured (03:06 WITA, GET only, script outside git)
- The token is a production one (`t=false`), ES256, expires 2027-03-17; claim `s` is an access bitmask (bits 1,2,3,4,5,7,30 set).
  Which bit means what — the staff does NOT know from a source; a memory says bit 30 = «read only», and memory is not a source (rule 17a).
- Seller behind the key: «ФНП / Фабрика Натуральных Продуктов» (tin 524900658999). Whether this is Oksana's cabinet is
  an open question WITH IVAN. Consequence for you: import ONLY into the LOCAL stand database (127.0.0.1:5433, per AGENTS.md).
  Nothing of this task touches the live host; a deploy is a separate task after Ivan confirms the cabinet.
- `GET https://<name>.wildberries.ru/ping` → 200 `{"TS":…,"Status":"OK"}` for `common-api`, `content-api`,
  `marketplace-api`, `statistics-api`, `discounts-prices-api`, `seller-analytics-api`, `feedbacks-api`;
  403 «scope is not allowed for this resource» for `supplies-api`, `finance-api`.
  `GET https://common-api.wildberries.ru/api/v1/seller-info` → 200 with `name`, `sid`, `tradeMark`.
  Auth header: `Authorization: <token>` (no `Bearer`).
- Documentation portal `https://dev.wildberries.ru/openapi/api-information` (sections «Контент», «Цены и скидки»,
  «Маркетплейс», «Статистика», «Отзывы и вопросы») sits behind an antibot: curl/WebFetch get a challenge page.
  Read it with Playwright + headed Chromium (a real profile) and keep screenshots of the pages you rely on in
  `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/docs/`. If the portal stays unreachable, restrict yourself to endpoints you
  could verify by a live GET and write the limitation down. Do not invent endpoint paths from memory: every endpoint in
  the registry cites the doc page (URL + screenshot file) or a live measured response.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Module `apps/backend/src/modules/wb` (follow `apps/backend/src/modules/README.md`; `product-review` and `tenant` are the house examples)
**`transport.ts` — the ONLY file in the repository that performs network I/O towards `*.wildberries.ru` / `*.wb.ru`.**
- Public surface: `wbRead(endpointId, { params, query, body })`. The caller names a registry entry, never a method or a URL.
- `WB_READ_ENDPOINTS` — a registry of READ endpoints: `{ id, host, method: 'GET' | 'POST', path, readViaPost?: { docUrl, reason } }`.
  Default deny: a request that does not match an entry throws `WbWriteForbiddenError` BEFORE any network call.
  `PUT`, `PATCH`, `DELETE` can never be registered (the registry validator throws at module load). `POST` is allowed
  ONLY for endpoints the WB documentation defines as queries with a body (WB's content API lists cards through a
  POST with a cursor — verify the exact path in the docs), each such entry carries `readViaPost.docUrl`, and the same
  list of POST entries is duplicated BY HAND in the guard test (double bookkeeping by design — adding a POST entry
  must fail a test until a human adds it there too).
- No escape hatches: the module does not export `fetch`, an axios instance, a base URL or a «raw request» helper.
- Timeout 15 s, `429`/`Retry-After` honoured with bounded backoff, structured log lines with the token redacted
  (`Authorization: ***`), every call appended to a transport journal (`wb_api_call`: endpointId, host, method, status,
  ms, fetched_at) so the acceptor can prove nothing but registered reads left the process.

**Guard tests (jest, `apps/backend/src/modules/wb/__tests__/transport.spec.ts`), fetch replaced by a spy:**
- each of `POST` (non-registered path), `PUT`, `PATCH`, `DELETE` → throws `WbWriteForbiddenError`, spy called 0 times;
- a GET to a non-registered host (`https://evil.example/ping`) or path → throws, spy 0 calls;
- a registered GET → spy called exactly once, `method: 'GET'`, `Authorization` present, and the token value never
  appears in log output captured during the test;
- registry validation: an entry with `method: 'DELETE'` (or `PUT`/`PATCH`) makes `validateRegistry()` throw;
- the POST entries of the registry equal the hand-written list in the test file.
**Repository lint test** (`transport-single-call-site.spec.ts`): scans `apps/backend/src`, `apps/storefront/src`,
`apps/tenant-panel/src` for `wildberries.ru` / `wb.ru` / `wildberries` inside `fetch(`/`axios`/`request(` call sites
and fails if any file other than `transport.ts` has one. It must be RED if you add a second call site — show that in the PR (temporarily add one, run, remove).

### 2. Key-permission check (rule 17a: facts from a source, never from memory)
`inspectToken(key)` decodes the JWT payload WITHOUT verification (no secret needed): `exp`, `t` (sandbox flag), `sid`,
`oid`, `s` (mask, printed as a bit list). Then find in the WB documentation (browser) what the `s` bits and the
«Только на чтение» option mean and encode the finding WITH its doc URL; if the docs do not say, the status reports
`readOnly: 'unknown'` — never `true` from memory. Expose it as `GET /tenants/wb/status` (owner-authenticated, same
conventions as the other `/tenants/*` routes — see `integration-tests/http/tenants.spec.ts` and `src/api/tenants/`),
returning the decoded facts, the mask, `readOnly`, the endpoint registry (ids, methods), and the last sync runs. The
token itself is never returned. On boot the module logs one WARNING line when `readOnly !== true`, and keeps working —
the transport cannot write regardless.

### 3. Key storage per tenant
The platform is multi-tenant: the key belongs to tenant `cherkashino`, not to the process. Reuse the tenant-secrets
mechanism (`apps/backend/src/tenant-secrets`, built in t03 for Robokassa) — store the WB key as a tenant secret and read
it from there in the sync. A script `pnpm --filter backend wb:seed-key --tenant cherkashino` takes `WB_API_KEY` from
the environment and writes it into the tenant's secrets on the LOCAL stand (idempotent, prints only «stored/updated»).

### 4. Mirror tables (data models of the module) + first import
Every mirror row carries `tenant_id`, `source = 'wb'`, `fetched_at`, `raw` (the JSON as received). Minimum set:
- `wb_product` — nmID, imtID, vendorCode, title, brand, subject, photos, dimensions, `raw`;
- `wb_price` — nmID, sizeID/price/discount fields as the prices API returns them;
- `wb_stock` — nmID/sku, warehouse (id + name), quantity;
- `wb_sync_run` — kind (cards | prices | stocks | …), started_at, finished_at, rows, status, error.
Add `wb_order` / `wb_feedback` mirrors in the same PR only if the doc pages for those reads are verified and the import
is cheap; otherwise list them under «not done» — a follow-up task will take them.
`pnpm --filter backend wb:sync --tenant cherkashino --kind cards|prices|stocks|all` — paginated reads through
`wbRead`, upsert into the mirrors, one `wb_sync_run` per kind. Migrations via `npx medusa db:generate wb` (mind the
snapshot trap recorded in b15: after generating, `db:generate` on a clean tree must not produce a second migration).

### 5. Owner-panel visibility (small)
A read-only card in the tenant panel (`apps/tenant-panel`) «Wildberries» showing the status from
`GET /tenants/wb/status` (key expiry, read-only status, last sync per kind, row counts). Geist components only
(`~/upready/packages/geist-kit/AGENTS.md`); no import buttons — the sync is a script/job in this task.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. Guard tests + lint test: `cd apps/backend && pnpm test:unit` → the file-level `fail 0` line; the RED run with a
   second call site, then GREEN after removing it.
2. `pnpm --filter backend wb:seed-key …` then `wb:sync --kind all` on the local stand with tenant `cherkashino`:
   the run log and `select kind, rows, status from wb_sync_run` + `select count(*) from wb_product / wb_price / wb_stock`.
3. `select endpoint_id, method, count(*) from wb_api_call group by 1,2` — the complete set of what left the process;
   every row is a registered read.
4. `curl` to `GET /tenants/wb/status` with the owner token (redact the token): shows `readOnly` with the doc URL or `unknown`.
5. `git grep -n "eyJhbGci" -- .` → empty; `git status` clean of any `.env*`.
6. Screenshot of the owner-panel card.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` (what is verified against docs, what against a live GET,
what is unknown) and the UI `report.json` per the preamble.
