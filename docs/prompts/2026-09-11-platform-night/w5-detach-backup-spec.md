[AGENT: w5-detach-backup-spec] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W5 — Specs: detaching a tenant into a standalone Medusa (7.2) and per-tenant backup (7.3)

You are a platform architect writing two SPECS on top of the export bundle that W3 has just built
(`exportTenantWorkflow`, `docs/multitenancy/tenant-bundle-format.md`, CLI `scripts/tenant-export.mjs`).
No code tonight. Facts about Medusa's import capabilities come from `node_modules` and the fetched
Medusa 2.x documentation, not from memory.

## Read first

1. `docs/multitenancy/2026-09-11-night-2-platform-brief.md` — parts B2, B3 and «Что уже есть».
2. `docs/multitenancy/tenant-bundle-format.md` and `.ai/progress-w3.md` — the bundle, its measured size
   and export time on the stand (copy the numbers with their units; if a number is missing there, run
   `cd apps/backend && node scripts/tenant-export.mjs acme --out /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/artifacts/deliverables/tenant-exports`
   yourself and record what it prints).
3. `docs/multitenancy/admin-tenants-api-contract.md` §5 (files under `tenants/<id>/`) and §4 (soft delete).
4. Backup rules of the house: `~/r/42a.md`, `~/r/42d.md` (three tiers, restic → R2) and
   `ls ~/upready/memory | grep -i backup` → read the matches; quote paths.
5. Medusa import capabilities, verified: `ls apps/backend/node_modules/@medusajs/core-flows/dist/*/workflows | grep -i 'import\|create'`
   (products have `importProductsWorkflow` + CSV; orders — check for any import; customers, categories,
   collections, inventory, regions, shipping options — create workflows exist), and the docs pages
   `https://docs.medusajs.com/resources/commerce-modules/product/...` / `.../order/...` you fetch
   (save as `artifacts/research/2026-09-11-detach-backup/source-<N>-<slug>.md` with `# Source` /
   `# Fetched` / `# Topic` headers, facts only).

## Deliverable 1 — `docs/multitenancy/detach-spec.md` (Russian)

1. **Что такое standalone** — a fresh Medusa 2.19 instance (own DB, own native Admin, own storefront
   deploy) owned by the client; what they gain (full Admin) and lose (platform panel, shared updates).
2. **Шаги переноса** — numbered runbook: export bundle (A3) → provision the instance (repo template,
   env, migrations, admin user) → import in order (regions/shipping profile → warehouse → categories /
   collections → products + variants + prices → inventory → customers → files → orders) with, per step:
   the Medusa workflow or API that does it natively, or «вручную / скриптом» when there is none, and
   the id remapping needed (old id → new id map kept in the import log).
3. **Заказы** — Medusa has no order import API (verify): options: CSV archive for the client's records;
   direct DB copy of the order graph as a paid service (tables involved — list them from
   `node_modules/@medusajs/order/dist/models`); recommendation.
4. **Файлы** — copy of the `tenants/<id>/` prefix into the client's bucket (`rclone` / SDK), URL
   rewriting in product images (old public URL → new), what stays referenced by the platform.
5. **Домен** — DNS move from the platform proxy to the client's deploy; the technical subdomain is
   retired; TTL and the overlap window.
6. **Что не переносится** — a plain list (auth identities/passwords — admins are re-invited; payment
   provider connections; analytics; anything of the panel's page/home config models until they exist on
   this branch).
7. **Приёмка переноса** — the checks: counts equal to the bundle manifest per entity, a product page
   renders, checkout on the new instance completes with a test payment, order history readable.
8. **Цена и время** — an estimate table: step · who (script / engineer) · minutes on the stand bundle
   (extrapolate from the measured export time and the counts; say it is an estimate).

## Deliverable 2 — `docs/multitenancy/backup-spec.md` (Russian)

1. **Ярусы** — the platform backup as it stands (42a: whole DB + bucket, restic → R2) with the paths you
   quoted; per-tenant backup is a fourth, logical tier on top, not a replacement.
2. **Схема** — nightly job (Medusa scheduled job in `src/jobs/`, name it, cron `0 3 * * *` UTC+8 as a
   proposal) running `exportTenantWorkflow` for every non-archived tenant → `tenants/<id>/backups/<YYYY-MM-DD>.json.gz`
   in R2 (the tenant's own prefix, so a purge removes them too — or a separate `backups/` root; decide,
   give the reason); retention 30 daily + 12 monthly; manifest per run; failures alert how.
3. **Размер и время** — the measured bundle bytes (json and gz) and export seconds for the stand tenant,
   and the extrapolation per tenant size class (10 / 100 / 1000 products, 0 / 1k / 10k orders) as
   formulas from the measured per-entity bytes (compute them from the manifest counts and bytes).
4. **Восстановление** — restore = import of the bundle into the SAME instance with replace semantics
   (the same runbook as detach-spec §2, minus provisioning), what «replace» means per entity, the
   soft-deleted tenant case (restore after an accidental delete: un-archive + re-enable channel +
   un-revoke or re-issue the key + files intact when `purge_files` was false).
5. **Проверка бэкапа** — a monthly restore drill into a throwaway DB (the integration-test runner already
   knows how to create one), acceptance = counts match.
6. **Развилки** — only if a real one remains (e.g. R2 prefix placement); otherwise «развилок нет».

## Rules

- No git commit/push/add. Write only the two specs and the source files. Read-only against every DB.
- Do not ask; decide, record in `.ai/progress-w5.md`, continue.
- Progress: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w5.md` +
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w5-detach-backup-spec --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 20 lines)

```
STATUS: done | partial | blocked
FILES: <two specs>, <n> source files
BUNDLE_NUMBERS: bytes_json=<n> bytes_gz=<n> seconds=<s> (source: <path>)
ORDER_IMPORT: <native|none — verified where>
FORKS: <n> (titles)
OPEN: <what is missing and why>
```
