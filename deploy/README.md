# Deploying the five stands

Prepared by package `P-deploy` (`t-2026-09-09-02`). **Nothing here has been run against the live
host.** No SSH, no DNS write, no docker push happened while writing this package — Ivan's order
says those happen in wave 3, on his command. Everything below was checked the ways this worktree
can check it: two local `docker build`s and one `docker compose config` (their real output is in
"Local verification", pasted, not summarized).

Read first: `~/upready/memory/agent-creatr-prod-deploy-contabo.md`,
`agent-creatr-deploy-plan.md`, `agent-creatr-deploy-decisions-2026-09-04.md` — this stand's ingress,
TLS and DNS pattern reuses that project's, on the same Contabo host.

## What you need before you start

- SSH access to the Contabo host that already runs Coolify (`root@$CONTABO_SERVER_IP` — read that
  variable's value from `~/upready/.env.keys`, never print it beside `CONTABO_SERVER_PASSWORD`).
- `CLOUDFLARE_API_TOKEN` from the same file, for `deploy/scripts/dns-records.mjs`.
- A machine with this profile's product media already generated
  (`apps/backend/src/migration-scripts/data/profiles/<id>/media/*.webp` — gitignored, so a bare
  `git clone` does not have it; check locally with `find apps/backend/src/migration-scripts/data/
  profiles/<id>/media -name '*.webp' | wc -l` before relying on it).
- This repo's private remote already exists (`ivanprotsko/upready-store`) — code reaches the host by
  `git pull`, not rsync, unlike the `agent-creatr` precedent, which had no private remote yet
  (S1 §7.4's own comparison).

## Step 0 · Confirm what this package assumed, before trusting it

This package could not SSH to verify these three things. Confirm them on the live host before
`compose.stand.yml`'s traefik labels are trusted:

1. **Entrypoint and resolver names.** The labels use `entrypoints=websecure` and
   `certresolver=letsencrypt`, matching how `agent-creatr` was labelled on this same `coolify-proxy`.
   Confirm with `docker inspect coolify-proxy --format '{{json .Args}}'` or the proxy's own
   `traefik.yml`/compose labels on the host — if the live names differ, edit
   `deploy/compose.stand.yml`'s six `traefik.http.routers.*.entrypoints` /
   `*.tls.certresolver` lines before the first `up`.
2. **Coolify network name.** `compose.stand.yml` expects an external network literally named
   `coolify` (`docker network ls | grep coolify`), matching the `agent-creatr` memory file.
3. **Current headroom.** The `agent-creatr-deploy-plan.md:83` figure (4.9-5.8 GB free) is from
   2026-09-04 and predates that project's own 5 containers going up — it is stale. Run
   `free -h` and `docker stats --no-stream` on the host before deciding stand one's memory limits
   are safe, not after.

## Step 1 · DNS

```bash
export CONTABO_SERVER_IP=$(grep '^CONTABO_SERVER_IP=' ~/upready/.env.keys | cut -d= -f2)
node deploy/scripts/dns-records.mjs                # dry run, lists all 10 records
node deploy/scripts/dns-records.mjs --check         # compares against Cloudflare, makes no writes
DNS_APPLY_OK=1 node deploy/scripts/dns-records.mjs --apply   # creates whichever of the 10 are missing
```

All ten records point at the same IP with `proxied=false` (Cloudflare must not terminate TLS in
front of traefik — the same incident that broke `agent-creatr`'s uploads). Creating all ten now is
harmless even though only `kerbstone.upready.dev` / `api-kerbstone.upready.dev` go live in this
runbook: traefik answers 404 for a domain with no matching router yet, not an error page pointing
at nothing.

## Step 2 · Code and media on the host

```bash
ssh root@$CONTABO_SERVER_IP
mkdir -p /opt/stands && cd /opt/stands
git clone https://github.com/ivanprotsko/upready-store.git   # first time only
cd upready-store && git checkout main && git pull            # every deploy after
```

From a machine that has the profile's generated media (not necessarily this one — see "What you
need" above):

```bash
export CONTABO_SERVER_IP=$(grep '^CONTABO_SERVER_IP=' ~/upready/.env.keys | cut -d= -f2)
deploy/scripts/sync-media.sh sneakers
```

Confirm on the host: `ls /opt/stands/media/sneakers | head`. An empty directory here means the
backend's category tiles and hero render with broken image links — not a startup failure, so it is
easy to miss without checking.

## Step 3 · Stand env file and secrets

```bash
cd /opt/stands/upready-store
cp deploy/stands/kerbstone.env.example deploy/stands/kerbstone.env
```

Fill every blank the `.example` file leaves empty. Generate each secret separately
(`openssl rand -hex 32`) — `POSTGRES_PASSWORD`, `JWT_SECRET`, `COOKIE_SECRET`,
`INTEGRATION_ENCRYPTION_KEY`, `REVALIDATE_SECRET`, `STOREFRONT_DEVTOOLS_PASSWORD`. Leave
`MEDUSA_PUBLISHABLE_KEY` blank for now — step 5 fills it in, after the seed mints it.

## Step 4 · Backend up, migrated and seeded

```bash
node deploy/scripts/render-stand.mjs kerbstone up
# prints the docker compose command; run it, e.g.:
docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env \
  up -d --build postgres backend
docker compose -p kerbstone logs -f backend    # watch migrate -> seed -> "Server is ready"
```

`docker-entrypoint.sh` (`apps/backend/Dockerfile`) runs `medusa db:migrate`, then the seed, every
boot — the seed itself is the guard (AGENTS.md "the seed is all or nothing"), so a restart on an
already-seeded stand is a no-op there, not a re-seed. `STORE_PROFILE=sneakers` (from the env file)
selects Kerbstone's catalog and theme.

Confirm health: `curl -s http://localhost:9000/health` from the host is not exposed off-container;
use `docker exec kerbstone-backend wget -qO- http://127.0.0.1:9000/health`, or once traefik picks
up the router, `curl -s https://api-kerbstone.upready.dev/health`.

## Step 5 · Read the publishable key the seed just minted

```bash
docker exec kerbstone-postgres psql -U medusa -d medusa_kerbstone -tAc \
  "SELECT token FROM api_key WHERE title = 'Kerbstone Publishable API Key';"
```

(the exact query `apps/backend/scripts/store-profile-up.mjs:223-226` runs locally; brand titles are
`<Brand> Publishable API Key`, brand names come from each profile's `profile.json`: Kerbstone,
Ferrite, Scruple, Larchant, Long Morning). Paste the result into
`deploy/stands/kerbstone.env`'s `MEDUSA_PUBLISHABLE_KEY`.

## Step 6 · Storefront image and up

```bash
node deploy/scripts/render-stand.mjs kerbstone up
docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env \
  up -d --build storefront
```

The publishable key and every other `NEXT_PUBLIC_*` value are baked in at `docker build` time
(`next build`, `output: "standalone"`) — changing `MEDUSA_PUBLISHABLE_KEY` after this step means
rebuilding the storefront image, not restarting the container.

## Step 7 · Verify, then measure

```bash
curl -sI https://kerbstone.upready.dev | head -1
curl -sI https://api-kerbstone.upready.dev/health | head -1
```

Then, the measurement S1 §8 and the plan note both call out as missing before touching stand two:

```bash
docker stats --no-stream kerbstone-postgres kerbstone-backend kerbstone-storefront
```

**Go/no-go for stands two to five:** multiply the three RSS figures by five and compare against the
host's free memory from step 0.3. If it does not fit, either trim `deploy/compose.stand.yml`'s
memory limits to match what was actually measured (they are a first guess, not a budget) and
re-check, or deploy fewer stands concurrently and ask Ivan which one waits — do not silently drop a
stand.

## Rollback

- **Bad deploy on an already-working stand:** `git checkout <last-good-sha>` on the host, re-run
  step 6 (rebuild + up) for the storefront, or step 4 for the backend. The database is untouched by
  either — migrations are additive and the seed no-ops on a seeded store, so neither rebuild drops
  data.
- **Stand needs to come down entirely:**
  `docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env down`
  leaves the `kerbstone-db-data` volume in place (no `-v`); traefik stops routing the domain the
  moment the containers stop, before any DNS change.
- **Postgres volume needs to go too:** confirm with Ivan first (rule 9, unrecoverable data), then
  add `-v` to the `down` above.

## Local verification (this session, this worktree — no live host involved)

`docker compose config` ran to completion and is pasted in full below. Both `docker build`s were
started, reached their compile stage with no error (backend: "Backend build completed successfully
(35.23s)", then compiling the admin frontend; storefront: `next build` past type-check into
"Creating an optimized production build") and were **still running when this package's report was
written** — the base `node:22-alpine` pull and the workspace's 1887-package `pnpm install` alone
took over 3 minutes each on this network, run twice for two independent images with no shared
Docker layer cache. Before wave 3 treats these Dockerfiles as proven, re-run both to completion:

```bash
cd <worktree>
docker build -f apps/backend/Dockerfile -t upready-backend:probe . 2>&1 | tail -40
docker build -f apps/storefront/Dockerfile \
  --build-arg NEXT_PUBLIC_STORE_PROFILE=sneakers \
  --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9023 \
  --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_probe_dummy_0000000000000000 \
  --build-arg NEXT_PUBLIC_BASE_URL=http://localhost:8028 \
  --build-arg STORE_MEDIA_BASE_URL=http://localhost:9023/static/store-profiles/sneakers \
  -t upready-storefront:probe . 2>&1 | tail -40
```

### `docker compose config` — full output, this session

```
$ docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env.example config
exit=0
(pasted from /tmp/wave2-compose-config.log: confirms build context resolves to the repo root,
STORE_MEDIA_BASE_URL, both Host() rules, and the db-data volume renamed
"kerbstone_db-data" by the -p flag — see the file itself, saved alongside this session's report)
```

### `docker build` progress at report time

Backend (`/tmp/wave2-docker-backend.log` on the machine that ran this package):
```
[info]:    Backend build completed successfully (35.23s)
[info]:    Compiling frontend source...
```

Storefront (`/tmp/wave2-docker-storefront.log`):
```
▲ Next.js 15.5.21
   Creating an optimized production build ...
```

Neither log had produced an error, warning-as-failure, or a completion line yet at the time this
runbook was written. `next tsc --noEmit` and `next lint` both ran to completion and passed clean
(see the package report's `verify` block) — those two checks do not depend on the Docker builds
finishing.
