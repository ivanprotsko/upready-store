# Ozon Seller API — a client that is READ-ONLY BY CONSTRUCTION, `ozon_*` mirrors, key-permission check

## Ivan's order (2026-09-16 04:41 WITA, verbatim, Russian)
«подтверждаю, что магазин "Фабрика натуральных продуктов" это правильный магазин, документацию открывай через мой
браузер и смотри сам. Учти что скоро я дам ключ и под ozon, поэтому проектировать можно сразу с четом того, что он
будет. Что проектировать смотри в документации озон и в первую очередь на то что есть у конкурента
https://www.insales.ru/page/combo.»

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Marketplace APIs are READ-ONLY for us. Data moves one way: Ozon → our local database. **No code path in this
repository may ever send a mutating request to Ozon**, and that impossibility is enforced by code and proven by a
test — not by a comment, not by a config flag, not by trust in the key's access level.

## The one thing that makes Ozon different from WB, read it before you design anything
On Ozon the HTTP verb tells you nothing. Of the 467 methods parsed out of the saved reference,
**461 are POST and 6 are GET** (`artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`). `POST /v3/product/list`
is "get the list of products"; `POST /v3/product/import` creates and updates products; `POST /v2/products/stocks`
overwrites inventory; `POST /v1/review/comment/create` posts a public comment under a customer's review. They are the
same verb on the same host.

Therefore: an allow-list of exact `(method, path)` pairs the documentation calls a read, default deny, and — because
every entry will be a POST — **`readViaPost.docUrl` + a verbatim `reason` on EVERY entry**, plus the same list of ids
duplicated BY HAND in the guard test. That double bookkeeping is not ceremony here; it is the only thing between us
and a typo that publishes a comment in Oksana's name.

## Sources (cite every claim with a URL and the saved copy; nothing from memory — rule 17a)
- `artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt` — the WHOLE Ozon Seller API reference
  as one page (1 441 722 characters), saved 2026-09-15T20:50Z through a headed Chrome over CDP.
- `artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv` — METHOD / PATH / SUMMARY / first line of the
  description for all 467 methods. Use it to find a method, then read its block in the page for the real contract.
- Live: `https://docs.ozon.ru/api/seller/#operation/<operationId>` — the anchors are in
  `docs.ozon.ru-api-seller-index.links.txt`. The site answers curl with a `?__rr=1…5` redirect loop and then 403; if
  you need a page it does not have, use the recipe in `artifacts/docs/w10-marketplace-spec/scripts/README.md`
  (Chrome started by hand with `--remote-debugging-port`, driven over CDP; stop it by PORT when done).
- The house example of everything below: `apps/backend/src/modules/wb/` from PR #71. Read `endpoints.ts` and
  `transport.ts` first — this module is its Ozon twin, deliberately.
- The design this task implements: `handoff/day-2026-09-16-oksana-store/research/marketplace-spec.md`, sections 2.2, 2.5, 3.

## Facts already established (do not re-derive, do re-check if you touch them)
- Base URL `https://api-seller.ozon.ru`. Auth headers `Client-Id` and `Api-Key` (or OAuth `Authorization: Bearer`).
- Rate limit: **no more than 50 requests per second on all methods from one Client-Id**; individual methods are
  stricter (`/v1/analytics/data` — once per minute).
- The API key lives **3 months**. `POST /v1/roles` returns `{ expires_at, roles: [{ name, methods: [...] }] }` — this is
  the documented way to ask the key what it is allowed to do (`#operation/AccessAPI_RolesByToken`).
- **No sandbox is documented.** The word "песочница" appears once on the reference page and refers to the rich-content
  editor. Design the task so it is acceptable WITHOUT a live key.
- Reviews need the "Управление отзывами" or Premium Pro subscription; questions need Premium Plus; chats need
  Premium Plus/Pro. Record what the cabinet actually has once a key exists; until then write "unknown".

## The credentials (never copy a value anywhere)
File `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` — the MAIN checkout root, outside git.
Variable NAMES: `OZON_CLIENT_ID`, `OZON_API_KEY`. They may not exist yet — that is expected, see "Two modes" below.
Load them only into the process environment of a local run
(`set -a; source /Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino; set +a`). The values never enter:
`.env` files under git, logs, fixtures, the PR body, `report.json`, screenshots. Before `git push`:
`git grep -n -E "OZON_API_KEY=|Client-Id: [0-9]" -- .` must print nothing.

## Two modes, and the PR must say which one it ran
1. **No key yet** — everything below is built and accepted on RECORDED fixtures shaped by the documentation
   (response schemas copied from the saved page, not invented). The live import section of the PR says, in one line,
   «живого прогона не было: OZON_CLIENT_ID/OZON_API_KEY не заданы».
2. **Key present** — additionally run `ozon:sync --kind all` once against the LOCAL stand and quote the counts.
Never fake mode 2. A fixture run reported as a live run is the failure this whole task exists to prevent.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. `apps/backend/src/modules/ozon/endpoints.ts` — the allow-list
Same shape as `wb/endpoints.ts`: `{ id, host, method, path, docUrl, summary, readViaPost, timeoutMs? }`, a
`validateRegistry()` that runs at module load, `resolveEndpoint(id)` that throws `OzonWriteForbiddenError` on a miss.
Additions Ozon needs:
- `host` must be exactly `api-seller.ozon.ru`;
- **`readViaPost` required on every POST entry** (i.e. on effectively every entry), carrying the doc anchor and the
  method's own sentence copied verbatim;
- **a deny-list of known mutations** (`guards.ts` in the marketplace core once w12 lands; a local constant until then):
  `/v1/product/import`, `/v1/product/import/prices`, `/v1/product/import-by-sku`, `/v2/products/stocks`,
  `/v1/product/archive`, `/v1/product/unarchive`, `/v2/products/delete`, `/v1/product/attributes/update`,
  `/v1/review/comment/create`, `/v2/review/comment/delete`, `/v1/review/change-status`, `/v2/review/change-status`,
  `/v1/question/answer/create`, `/v1/question/answer/delete`, `/v1/question/change-status`, `/v1/chat/send/message`,
  `/v1/chat/send/file`, `/v1/chat/start`, `/v2/chat/read`, `/v1/returns/settings/utilization/update`,
  `/v1/returns/rfbs/action/set`, everything under `/v1/posting/fbs/` that the docs describe as an action.
  A registry entry whose path is in the deny-list fails module load. Verify each of these against the saved page
  before you commit the list — a deny-list built from memory is the same bug one level up.

Minimum registry (verify each against the saved page and cite it; drop anything you cannot verify):

| id | method | path | why |
|---|---|---|---|
| `access.roles` | POST | `/v1/roles` | key expiry + roles + allowed methods |
| `seller.info` | POST | `/v1/seller/info` | cabinet identity |
| `product.list` | POST | `/v3/product/list` | `offer_id` + `product_id` of every product |
| `product.info.list` | POST | `/v3/product/info/list` | product cards by id |
| `product.info.attributes` | POST | `/v4/product/info/attributes` | characteristics |
| `product.info.description` | POST | `/v1/product/info/description` | name and description |
| `product.prices` | POST | `/v5/product/info/prices` | prices |
| `product.stocks` | POST | `/v4/product/info/stocks` | quantities per scheme |
| `warehouse.list` | POST | `/v2/warehouse/list` | FBS/rFBS warehouses (`/v1/warehouse/list` is being switched off 7 Apr 2026 — do not register it) |
| `posting.fbs.list` | POST | `/v4/posting/fbs/list` | FBS/rFBS orders (`/v3/posting/fbs/list` is deprecated from 31 Aug 2026) |
| `posting.fbo.list` | POST | `/v3/posting/fbo/list` | FBO orders (`/v2/posting/fbo/list` deprecated) |
| `posting.fbs.get` | POST | `/v3/posting/fbs/get` | one order |
| `returns.list` | POST | `/v1/returns/list` | returns FBO and FBS |
| `review.list` | POST | `/v2/review/list` | reviews (subscription-gated) |
| `review.count` | POST | `/v2/review/count` | review counters |
| `question.list` | POST | `/v1/question/list` | questions (Premium Plus) |
| `analytics.data` | POST | `/v1/analytics/data` | sales analytics — **1 request per minute** |
| `analytics.stocks` | POST | `/v1/analytics/stocks` | stock analytics, days-to-zero |
| `rating.summary` | POST | `/v1/rating/summary` | seller rating |

### 2. `apps/backend/src/modules/ozon/transport.ts` — the ONLY network I/O to `api-seller.ozon.ru`
Public surface `ozonRead(endpointId, { body, params, query, credentials, tenantId, syncRunId, journal, logger })`.
The caller never passes a method, a host, a URL or a header. No exported `fetch`, no client instance, no base URL, no
"raw request" helper. Timeout with a per-entry override, 429 honoured with bounded backoff, `Api-Key` redacted in every
log line, one `ozon_api_call` row per call. Copy the structure of `wb/transport.ts` rather than inventing a second one.

### 3. Guard tests, `fetch` replaced by a spy
- `PUT`, `PATCH`, `DELETE`, an unregistered path, a deny-listed path, a foreign host → throw **before** any socket,
  spy called 0 times;
- a registered read → spy called exactly once, method from the registry, both auth headers present, and neither the
  key nor the Client-Id appears in captured log output;
- `validateRegistry()` throws on a write verb, on a POST without `readViaPost.docUrl`, on a non-`api-seller.ozon.ru` host;
- the POST ids of the registry equal the hand-written list in the test file;
- **repo lint** (`transport-single-call-site.unit.spec.ts`): `api-seller.ozon.ru` / `ozon.ru` inside `fetch(`/`axios`/
  `request(` may appear only in `transport.ts`. Show it RED with a second call site, then GREEN after removing it.

### 4. Credentials per tenant
Reuse `apps/backend/src/tenant-secrets` (`wildberries.ts` is the example): provider `ozon`, payload
`{ client_id, api_key }`, AES-256-GCM, no route ever returns the value. Script
`pnpm --filter backend ozon:seed-key --tenant cherkashino` takes the two env vars and writes the secret (idempotent,
prints only «stored/updated»). `inspectCredentials` calls `access.roles` and returns
`{ set, last4, expiresAt, roles, readOnly, readOnlySource }`, where `readOnly` is `true` only when no method in
`roles[].methods` matches the deny-list, `false` when one does, and `"unknown"` when the call did not answer.
Never `true` from memory.

### 5. Mirrors + sync
Models `ozon_product`, `ozon_price`, `ozon_stock`, `ozon_posting`, `ozon_review`, `ozon_question`, `ozon_sync_run`,
`ozon_api_call` — each row carries `tenant_id`, `source = 'ozon'`, `fetched_at`, `raw`. Sync kinds
`products | prices | stocks | postings | reviews | questions`, one `ozon_sync_run` per kind with `running → succeeded|failed`.
Script `pnpm --filter backend ozon:sync --tenant cherkashino --kind <kind>|all`. Migrations via
`npx medusa db:generate ozon`; after generating, a second `db:generate` on a clean tree must produce nothing (the
snapshot trap recorded in b15).

### 6. `GET /tenants/ozon/status`
Owner-authenticated, same conventions as `/tenants/wb/status`. Returns the decoded facts, the roles, `readOnly` with
its source, the endpoint registry (ids, methods, doc URLs) and the last sync runs. Never the key.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → the file-level `ℹ fail 0` line of the whole file, not just your new test.
2. The repo lint RED with a second call site, then GREEN.
3. Fixtures: `ozon:sync --kind all --fixtures` on the LOCAL stand — `select kind, rows, status from ozon_sync_run`
   and `select count(*)` per mirror.
4. `select endpoint_id, method, count(*) from ozon_api_call group by 1,2` — everything that left the process; every
   row is a registered read.
5. `curl` to `GET /tenants/ozon/status` (redact the owner token) — shows roles and `readOnly` with its source, or `unknown`.
6. If a key exists: the live `ozon:sync --kind all` run and the same counts. If not: the one-line statement that it did not run.
7. `git grep -n -E "OZON_API_KEY=|eyJhbGci" -- .` → empty.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` (what is verified against the docs, what against a live
call, what is unknown) plus the UI `report.json` per the preamble.

## Do not
Call any Ozon method outside the registry. Touch `apps/backend/src/modules/wb/**` (w12 does that). Run migrations on
the live host. Start a local Docker or a VM. Invent a response shape you did not read on the saved page.
