[AGENT: w6-hosting-spec] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W6 — Spec with measurements: server and hosting as tenants grow (incl. the proxy for custom tenant domains)

You are an infrastructure engineer writing `docs/multitenancy/hosting-spec.md`. Every number in it is
measured tonight on the local stand or fetched from a provider's live pricing page (WebFetch, saved as a
source file). Nothing from memory; a number without a unit and a source is not a number.

## Read first

1. `docs/multitenancy/2026-09-11-night-2-platform-brief.md` — part B4 and «Что уже есть».
2. Where production runs today: `~/r/s5.md`, then `ls ~/upready/memory | grep -i 'deploy\|contabo\|hetzner\|server\|prod'`
   and read the matching files; quote the host/provider/plan you find with the file path. Not found →
   write «не найдено в памяти», never a guess.
3. `apps/backend/medusa-config.ts` (Redis, S3 only in production, worker mode not set today),
   `apps/backend/.env` of this worktree (PORT=9025, the stand DB), `deploy/**` (what deployment files
   exist), `~/upready/memory/decisions/2026-09-10-multitenancy-target-first-config-in-db.md` last section
   (the one-storefront-per-Host decision and the 2.6 GB Turbopack measurement), and
   `docs/multitenancy/2026-09-11-night-2-specs-brief.md` §2 item 1–2 (domain constraints: a domain is
   unique across tenants, every tenant always has a technical subdomain).

## Measurements (write a script for each under `artifacts/docs/platform-measurements/` and keep its
raw output next to it as `2026-09-11-<what>.txt`)

1. **RSS** of the running `medusa develop` on `:9025` (`ps -o rss,command -p <pid>`; find the pid with
   `lsof -nP -iTCP:9025 -sTCP:LISTEN`) — and of a production build: from `apps/backend` run
   `npx medusa build > /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w6-build.log 2>&1`
   (observable: the log file, one check when it ends), then start it on port **9026** with the same `.env`
   (`cd .medusa/server && cp ../../.env .env && PORT=9026 npx medusa start`, backgrounded with its own
   log file), measure RSS idle and after the load test, then stop ONLY that process (kill by the pid you
   started). Never touch ports 9023, 9024, 9025, 5180.
3. **DB size**: `psql postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt -c "select pg_size_pretty(pg_database_size('upready_store_mt')), pg_database_size('upready_store_mt')"`
   plus the ten largest tables (`pg_total_relation_size`) and the row counts of `product`, `order`,
   `tenant`, `sales_channel`. Read-only.
4. **p95 of `GET /store/products?limit=12`** with a tenant's publishable key
   (`x-publishable-api-key`, key values in `~/upready/memory/secrets/upready-store/local-mt-stand.txt`)
   at ~50 rps for 30 s against your `:9026` `medusa start` (and once against `:9025` develop for
   comparison). Neither `autocannon` nor `k6` is installed: write `artifacts/docs/platform-measurements/load.mjs`
   (Node 26 built-in `fetch`, open-loop scheduler at a fixed rate, records latency per request, prints
   count / errors / p50 / p95 / p99 / max in ms and the achieved rps). Warm up 5 s first.
5. **Bucket / files**: size of `apps/backend/static` on the stand (`du -sk`) and, if `~/upready/.env.keys`
   has `R2_BACKUP_*` credentials, the object count and total bytes of that bucket via a short
   `@aws-sdk/client-s3` script (read-only; resolve the SDK from
   `node_modules/.pnpm/@aws-sdk+client-s3*/node_modules/@aws-sdk/client-s3` by absolute path; skip with a
   note if not resolvable).
6. **Machine**: `sysctl -n hw.memsize hw.ncpu`, `sw_vers -productVersion`, `node -v`, `psql --version`.

## Fetch (save as `artifacts/research/2026-09-11-hosting/source-<N>-<slug>.md`, header
`# Source <url>` / `# Fetched <ISO>` / `# Topic`, extracted facts only)

- Pricing pages of Hetzner Cloud (CX/CPX + volumes + load balancer), Contabo VPS, and one managed
  Postgres offer (Hetzner has none — take Neon or Supabase or DigitalOcean managed PG, state which).
- Cloudflare R2 pricing (storage + class A/B ops, egress) — the object store already chosen (rule 42d).
- Caddy «On-Demand TLS» documentation (`ask` endpoint, rate limits, `on_demand_tls` global option) and
  the wildcard certificate requirement (DNS challenge for `*.upready.dev`, the Cloudflare DNS plugin).
  Alternative: Traefik's on-demand ACME. Cite both, recommend one with a reason.

## Deliverable — `docs/multitenancy/hosting-spec.md` (Russian; headings below)

1. **Где сейчас прод** — from memory files, with paths; or «не найдено».
2. **Замеры стенда** — one table: metric · value · unit · how measured (script path) · date.
3. **Целевая топология** — one backend process pair (`medusa start` server + worker via `workerMode`,
   read `node_modules/@medusajs/framework/dist/config` for the option name), Postgres 17, Redis, ONE
   multi-tenant storefront process (tenant by Host — the decision above; the panel session builds it as
   `t-2026-09-12-mt-storefront-by-host`), the static tenant panel, the reverse proxy, R2. A mermaid diagram.
4. **Прокси для доменов тенантов** (the section the owner asked for by name):
   - wildcard `*.upready.dev` → every tenant has `<handle>.upready.dev` from creation (DNS: one
     wildcard A/AAAA record to the proxy; a wildcard cert via DNS-01);
   - custom domains (`vasya.com`, `petya.ru`): Caddy on-demand TLS with an `ask` endpoint the backend
     serves (`GET /store/tenant-domains/check?domain=` → 200 only for a domain stored for a tenant —
     name the endpoint as a proposal, it is not built), rate limits, what happens for an unknown Host
     (proxy answers 404/redirect, never a certificate);
   - **the DNS instruction a tenant follows**, verbatim as it would appear in the panel: apex `A`
     record → proxy IP (or `ALIAS`/`ANAME` where supported), `www` `CNAME` → `<handle>.upready.dev`,
     TTL, how the panel verifies (a DNS lookup of the domain must point at the proxy before the domain is
     activated), propagation time, and what the tenant sees while pending;
   - how one Host maps onto the single storefront process: proxy forwards `Host` unchanged
     (`reverse_proxy` keeps it) → the storefront middleware resolves the tenant by Host from the DB
     (domains table of the by-host task) → publishable key + theme preset; `www.` and apex normalisation;
     the technical subdomain always works even after a custom domain is attached;
   - a Caddyfile sketch (fenced, ≤ 40 lines) for both cases.
5. **Таблица роста** — tenants (10 / 50 / 200 / 1000) → configuration (vCPU, RAM, PG placement, storefront
   instances, proxy) → price per month per provider (from the fetched pages, with the plan names) →
   the measured number that justifies it (RSS × instances + PG working set from the DB size ×
   tenants/3 stand tenants, p95 headroom). State the assumptions as formulas.
6. **Пороги** — from the measurements: at which N tenants or which X GB the DB moves to managed PG,
   when the storefront needs a second instance, when Redis becomes mandatory (`workerMode` needs it).
7. **Развилка провайдера** — Hetzner vs Contabo vs a managed platform: 2–3 options, recommendation,
   one reason each, what the owner must decide.
8. **Источники** — source files with URLs and timestamps; measurement scripts with paths.

## Rules

- No git commit/push/add. Read-only against every database. Stop only processes you started.
- Do not ask; decide, record decisions in your progress file, continue.
- Progress: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w6.md` +
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w6-hosting-spec --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 20 lines)

```
STATUS: done | partial | blocked
FILES: <spec>, <n> measurement files, <n> source files
NUMBERS: rss_develop=<MB> rss_start_idle=<MB> rss_start_load=<MB> db=<MB> p95_start=<ms>@<rps> p95_develop=<ms>@<rps> static=<KB> r2=<objects/bytes|skipped>
PROD_NOW: <host/provider from memory | not found>
FETCH_FAILED: <urls or none>
OPEN: <what is missing and why>
```
