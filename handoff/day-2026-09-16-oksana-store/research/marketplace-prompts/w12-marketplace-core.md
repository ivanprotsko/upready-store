# The `marketplace` core: one adapter contract, one conformance suite, the normalized `mp_*` layer, the panel section

## Why this task exists
Three screens of the parity matrix — "one order feed", "one price and stock table", "reviews" — are ONE screen over
TWO marketplaces (`handoff/day-2026-09-16-oksana-store/research/marketplace-spec.md`, section 1). Without a normalized
layer each of them is written twice and the two copies drift. The read-only invariant has the same problem one level
down: the registry, the single call site, the fetch spy and the repo lint are one set of rules that must apply to
EVERY adapter automatically. A rule copied by hand into the second adapter is a rule the third adapter forgets
(rule 20).

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Marketplaces are read-only for us. Nothing in this task may open a path that writes to WB or Ozon. The core makes the
existing guarantee STRONGER, never weaker: if after your change an adapter could write, the task failed.

## Sources
- The design: `research/marketplace-spec.md`, sections 2.1–2.7 (layout, contract, `mp_*` tables, linking, code rules,
  scheduler, panel). Follow it; where you find it wrong, say so in the report and do the right thing.
- The existing WB adapter: `apps/backend/src/modules/wb/` (PR #71) — `endpoints.ts`, `transport.ts`, `sync.ts`,
  `token.ts`, `models/wb-*.ts`, `__tests__/`.
- The existing panel page: `apps/tenant-panel/src/routes/settings/wildberries/` + `hooks/api/wb-status.tsx`.
- Geist is the design system: `~/upready/packages/geist-kit/AGENTS.md` before any UI work.
- If `w11-ozon-readonly-client` has merged, its adapter is your second conformance subject. If it has not, build the
  core against WB alone plus a deliberately broken test adapter (see below) and say so in the report.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. `apps/backend/src/modules/marketplace/contract.ts`
The `MarketplaceAdapter` type from spec section 2.2: `id`, `label`, `hostSuffixes`, `endpoints`, `read`,
`inspectCredentials`, `syncKinds`, `runSync`, `normalize.{products,offers,orders,reviews,questions}`, plus
`ReadEndpoint`, `ReadOptions`, `ReadResult`, `CredentialFacts`, `Mp*Draft`. Types only — no I/O in this file.

### 2. `apps/backend/src/modules/marketplace/registry.ts`
`MARKETPLACES: readonly MarketplaceAdapter[]`. **This is the only place adapters are enumerated.** Everything that
needs the list — the conformance suite, the repo lint, the panel route, the scheduler — imports it from here. A second
hard-coded list anywhere is the defect this file exists to remove.

### 3. `apps/backend/src/modules/marketplace/guards.ts`
`validateEndpointRegistry(adapter)`: write verbs unregistrable, host must end with one of the adapter's
`hostSuffixes`, `docUrl` required on every entry, `readViaPost.docUrl` + `reason` required on every POST, path must be
absolute, ids unique. Plus `MUTATION_DENY_LIST` per adapter id (the WB and Ozon lists from spec sections 2.5 and the
w11 prompt) — an entry matching a deny-listed `(method, path)` fails module load. Both run at load time for every
adapter in the registry.

### 4. `apps/backend/src/modules/wb/adapter.ts`
A NEW file that exposes the EXISTING `wb` pieces under the contract. `endpoints.ts`, `transport.ts`, `sync.ts`,
`token.ts` and the `wb_*` models are **not rewritten and not renamed**: `wbRead` stays the single I/O point for WB.
`normalize.*` are new pure functions `wb_* row → Mp*Draft` (spec section 2.3 for the field mapping: `nmID` →
`external_id`, `vendorCode` → `vendor_code`, `chrtID` → `size_external`, and so on). No network call lives in this file.

### 5. The normalized layer
Models `mp_product`, `mp_offer`, `mp_order`, `mp_order_line`, `mp_review`, `mp_question`, `mp_link`, `mp_sync_run`,
`mp_api_call` with the columns of spec section 2.3. Key everywhere `(tenant_id, marketplace, external_id)`; every row
carries `source_row_id` and `synced_at`. Migrate `wb_sync_run` / `wb_api_call` into `mp_sync_run` / `mp_api_call` with
`marketplace = 'wb'` — **data is not lost**; dropping the old tables is a separate later step, not this PR.
A projector `projectFromMirrors(tenantId, marketplace)` recomputes `mp_*` from the raw mirrors: it must be idempotent
(run it twice, counts identical — show that in the PR).

### 6. Linking by vendor code (`link.ts`)
`mp_product.vendor_code` → `product_variant.sku` within the tenant. Three outcomes, all visible:
exactly one match → `mp_link` with `matched_by = 'vendor_code'`; zero → the card lands in "не связано"; more than one →
**not linked automatically**, lands in "требует выбора". Taking the first silently is substituting a value for an
absence (rule 20a) and is the one thing this function must not do. A unit test covers all three.

### 7. The conformance suite — the point of the whole task
`modules/marketplace/__tests__/adapters-conform.unit.spec.ts` iterates over `MARKETPLACES` and runs the SAME set
against each: `PUT`/`PATCH`/`DELETE` and a foreign host through the adapter's `read` → throws before any socket,
fetch spy 0 calls; `validateEndpointRegistry` accepts the real registry and rejects hand-built bad entries; the
deny-list rejects a mutation path; every entry has a `docUrl`; the module exports no `fetch`, no base URL, no raw helper.
**Demonstrate the suite bites**: add a deliberately broken adapter to the registry, run, show it RED, remove it, show
it GREEN. Quote both runs in the PR.
`single-call-site.unit.spec.ts` — the repo lint generalized: it takes the host suffixes FROM `registry.ts` and scans
`apps/backend/src`, `apps/storefront/src`, `apps/tenant-panel/src`. Show that adding a host to the registry makes the
lint cover it **without editing the test**.

### 8. The panel section «Маркетплейсы»
`apps/tenant-panel/src/routes/settings/marketplaces/` — one card per adapter, built from the existing
`wb-read-only-badge` / `wb-endpoint-table` / `wb-sync-table` turned into shared `mp-*` components (spec section 2.7):
connection state (key set, last 4, expiry), key scope, last sync per kind with rows/requests/status/error, the registry
of allowed reads, and a warning when the key expires in under 14 days. Geist only.
Backend: `GET /tenants/marketplaces` (list) and `GET /tenants/marketplaces/:marketplace/status`.
**Do not break the old surface**: `/settings/wildberries` redirects to the new section, and `GET /tenants/wb/status`
keeps answering with the same body for one more wave.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → the whole-file `ℹ fail 0` line.
2. The conformance suite RED with the broken adapter in the registry, GREEN after removing it — both outputs.
3. The repo lint covering a newly registered host without a test edit — the diff and the run.
4. On the LOCAL stand for tenant `cherkashino`: `projectFromMirrors` run, then
   `select count(*) from mp_product / mp_offer / mp_order / mp_review;` and the same three counts after a SECOND run
   (identical — idempotence).
5. Linking numbers: cards total, auto-linked, not found, needs a choice — and their sum equals the total.
6. `select marketplace, kind, status, rows from mp_sync_run order by started_at desc limit 10;`
7. Screenshot of `/settings/marketplaces` and of the redirect from the old path.
8. `curl` to `GET /tenants/wb/status` proving the old route still answers.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Rewrite or rename `modules/wb/**` beyond adding `adapter.ts` and the pure `normalize` functions. Drop `wb_*` tables.
Add a second place where adapters are listed. Add any code path that can write to a marketplace. Touch the live host.
