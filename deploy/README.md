# Deploying the five stands

Prepared by package `P-deploy` (`t-2026-09-09-02`), then **corrected against the live host by
`P-deploy-stand1`**: stand one (Kerbstone) is deployed and serving on
https://kerbstone.upready.dev. Every step below has now been run for real at least once. Where the
first draft guessed and reality disagreed, the guess is gone and the measurement is in its place —
the literal commands and their literal output are in "Stand one — measured 2026-09-10" at the end
of this file. Stands two to five have not been deployed; read the go/no-go in that section first.

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
- `rsync` and `ssh` to that host with the key `~/.ssh/id_ed25519_contabo` (`BatchMode=yes` works;
  no password prompt, no `sshpass`). Code reaches the host by rsync from the worktree — see step 2
  for why the first draft's `git pull` plan does not survive contact with a gitignored media tree
  and an unpushed branch.

## Step 0 · Confirm the host, before trusting the labels

All three were open questions in the first draft. Two are now answered by measurement and the
answers are already in `compose.stand.yml`; re-check them only if the host's Coolify is upgraded:

1. **Entrypoint and resolver names — ANSWERED, and the first draft was wrong.**
   `docker inspect coolify-proxy --format '{{json .Args}}'` returns
   `--entrypoints.http.address=:80` and `--entrypoints.https.address=:443`: this proxy's
   entrypoints are named `http` and `https`, **not** traefik's stock `web`/`websecure` that
   P-deploy had guessed. An unknown entrypoint name makes traefik drop the router silently — no
   error in any log, the domain simply 404s — so this would have cost a long blind hunt.
   `compose.stand.yml` carries the corrected names. The resolver IS named `letsencrypt`.
2. **Coolify network name — ANSWERED.** `docker network ls` shows one network literally named
   `coolify` (id e241a978), as the `agent-creatr` memory file said. No change needed.
3. **Current headroom — MEASURED, and stand one's own numbers are now in this file.** With the
   Kerbstone triple up, `free -m` reports 11 960 MB total and 7 121 MB available on a host that
   also runs Coolify, agent-creatr, bpj-dev and verdaccio. The per-stand cost and the go/no-go for
   four more are in "Stand one — measured 2026-09-10".

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

**The code reaches the host by `rsync` from the worktree, not by `git clone` + `git pull`.** The
first draft assumed a clone; the real deploy pushes the working tree, because the branch being
deployed (`feat/stands/deploy`) is not on any remote and because the product media the stand needs
is gitignored — a clone would arrive without it. The host layout is
`/opt/upready-store/<stand>` for code and `/opt/upready-store/media/<profile>` for media, NOT
`/opt/stands`.

From the worktree, on a machine that has the profile's generated media:

```bash
export CONTABO_SERVER_IP=$(grep '^CONTABO_SERVER_IP=' ~/upready/.env.keys | cut -d= -f2)
rsync -az --delete \
  --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.ai' \
  --exclude '.turbo' --exclude 'dist' --exclude '.medusa' \
  -e "ssh -o BatchMode=yes -i $HOME/.ssh/id_ed25519_contabo" \
  ./ root@$CONTABO_SERVER_IP:/opt/upready-store/kerbstone/
ssh root@$CONTABO_SERVER_IP 'chmod 600 /opt/upready-store/kerbstone/deploy/stands/kerbstone.env'
deploy/scripts/sync-media.sh sneakers
```

`--delete` plus `--exclude .ai` matter together: without the exclude, rsync carries this worktree's
orchestration scratch to the host; without `--delete`, a file removed from the branch lives on in
the deployed tree forever. The `chmod` is not decoration — rsync recreates the env file with the
umask's permissions, and the stand's every secret is in it.

**After any rsync, confirm the env file is byte-identical on both sides** (`md5sum` on the host vs
`md5 -q` locally). A stand whose two copies have drifted is the one failure mode that looks like
nothing at all: the container reads the host copy, and you debug against the local one. This
caught a real drift on stand one — the host still held a superseded `MEDUSA_ADMIN_PASSWORD`, so the
admin user had been created with a password Ivan had already replaced. That particular drift now
heals itself on the next boot (see "The two demo logins"), but every other value in the file still
behaves exactly as described here, and `MEDUSA_PUBLISHABLE_KEY` is baked into an image rather than
read at boot — so keep comparing the digests.

Confirm the media landed: `ls /opt/upready-store/media/sneakers | head` and
`du -sh /opt/upready-store/media/sneakers` (2.7 MB for sneakers). An empty directory here means the
hero and category tiles render as broken images — not a startup failure, so it is easy to miss.

## Step 3 · Stand env file and secrets

Write it in the **worktree** (it is gitignored) and let step 2's rsync carry it to the host, so the
two copies cannot drift:

```bash
cp deploy/stands/kerbstone.env.example deploy/stands/kerbstone.env
chmod 600 deploy/stands/kerbstone.env
```

Fill every blank the `.example` file leaves empty. Generate each secret separately
(`openssl rand -hex 32`) — `POSTGRES_PASSWORD`, `JWT_SECRET`, `COOKIE_SECRET`,
`INTEGRATION_ENCRYPTION_KEY`, `REVALIDATE_SECRET`, `STOREFRONT_DEVTOOLS_PASSWORD`. Leave
`MEDUSA_PUBLISHABLE_KEY` blank for now — step 5 fills it in, after the seed mints it.

Four variables arrive already filled and are meant to stay that way: `MEDUSA_ADMIN_EMAIL`,
`MEDUSA_ADMIN_PASSWORD`, `DEMO_CUSTOMER_EMAIL` and `DEMO_CUSTOMER_PASSWORD` — the two demo logins
every stand shares, Ivan's decision of 2026-09-09. They are not secrets and are not generated per
stand; see "The two demo logins" below for what the backend does with them on every boot.

## Step 4 · Backend up, migrated and seeded

**Build detached, always.** A `docker compose build` run over an interactive ssh dies with the ssh
session, and a backend build is minutes long — stand one lost one whole build that way. Start it
with `setsid nohup` and a log file on the host, then read the log:

```bash
ssh -n root@$CONTABO_SERVER_IP 'cd /opt/upready-store/kerbstone && \
  setsid nohup docker compose -p kerbstone -f deploy/compose.stand.yml \
    --env-file deploy/stands/kerbstone.env build backend \
    > /opt/upready-store/kerbstone-build-backend.log 2>&1 < /dev/null &'
# then poll the LOG for its last line, not the process:
ssh -n root@$CONTABO_SERVER_IP 'tail -5 /opt/upready-store/kerbstone-build-backend.log'
```

Watch the **log**, not `pgrep`. A `pgrep -f "docker compose.*build backend"` issued over ssh matches
the `sh -c` that is running the pgrep itself, so it never reports zero and the wait runs to its
deadline while the build has long since finished. Stand one burned nine minutes on exactly that.

Then start the containers without rebuilding:

```bash
docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env \
  up -d --no-build postgres backend
docker compose -p kerbstone logs -f backend    # watch migrate -> seed -> "Server is ready"
```

`docker-entrypoint.sh` (`apps/backend/Dockerfile`) runs `medusa db:migrate`, then the seed, every
boot — the seed itself is the guard (AGENTS.md "the seed is all or nothing"), so a restart on an
already-seeded stand is a no-op there, not a re-seed. `STORE_PROFILE=sneakers` (from the env file)
selects Kerbstone's catalog and theme.

Confirm health with the container's own healthcheck, which is the honest signal:

```bash
docker inspect kerbstone-backend --format '{{.State.Health.Status}}|{{.RestartCount}}'
# healthy|0   <- what a good first boot looks like
```

**A non-zero `RestartCount` on a first boot is the whole story, and the log will not tell you.**
Stand one crash-looped invisibly: `restart: unless-stopped` plus a container that exits right after
the entrypoint finishes produces a log that runs migrations, runs the seed and creates the admin
user — every line green — and then simply starts over ~40 s later. The one line that mattered was
`docker-entrypoint.sh: exec: line 62: medusa: not found`, because `CMD ["medusa", "start"]` cannot
resolve a binary that `npm install` put in `/app/node_modules/.bin` and no PATH mentions. The
Dockerfile now sets that PATH and names the binary outright; if you ever see a boot loop here,
`docker logs <c> | grep -E "not found|\[entrypoint\] starting"` finds it in one pass.

Off-container the port is not published, by design: `docker exec kerbstone-backend wget -qO-
http://127.0.0.1:9000/health`, or once traefik has the router,
`curl -s https://api-kerbstone.upready.dev/health` -> `OK`.

## Step 5 · Read the publishable key the seed just minted

```bash
docker exec kerbstone-postgres psql -U medusa -d medusa_kerbstone -tAc \
  "SELECT token FROM api_key WHERE title = 'Kerbstone Publishable API Key';"
```

(the exact query `apps/backend/scripts/store-profile-up.mjs:223-226` runs locally; brand titles are
`<Brand> Publishable API Key`, brand names come from each profile's `profile.json`: Kerbstone,
Ferrite, Scruple, Larchant, Long Morning). Stand one's key came back 67 characters long with a
`pk_` prefix.

Write it into **both** copies of the env file and prove they match, without ever printing the key:
edit the host copy in place, `scp` it back to the worktree, then compare digests
(`md5sum` on the host, `md5 -q` locally). A key that reached only one copy is the same silent drift
step 2 warns about, and here it is worse — the storefront bakes this value in at image build time,
so a stale copy is baked into an image rather than read at boot.

## Step 6 · Storefront image and up

Rsync the corrected env file to the host first (step 2), then build detached exactly as in step 4
and start without rebuilding:

```bash
ssh -n root@$CONTABO_SERVER_IP 'cd /opt/upready-store/kerbstone && \
  setsid nohup docker compose -p kerbstone -f deploy/compose.stand.yml \
    --env-file deploy/stands/kerbstone.env build storefront \
    > /opt/upready-store/kerbstone-build-storefront.log 2>&1 < /dev/null &'
docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env \
  up -d --no-build storefront
```

The publishable key and every other `NEXT_PUBLIC_*` value are baked in at `docker build` time
(`next build`, `output: "standalone"`) — changing `MEDUSA_PUBLISHABLE_KEY` after this step means
rebuilding the storefront image, not restarting the container.

## Step 7 · Verify, then measure

Verify from your own machine, not from the host — the host can reach a container that the world
cannot. Every check below is the one stand one actually passed; the literal output is in the
measured section:

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url} tls=%{ssl_verify_result}\n' https://kerbstone.upready.dev/
curl -sS -w '\n%{http_code}\n' https://api-kerbstone.upready.dev/health
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://api-kerbstone.upready.dev/auth/user/emailpass \
  -H 'Content-Type: application/json' -d '{"email":"admin@upready.dev","password":"<the password>"}'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://kerbstone.upready.dev/api/devtools/unlock \
  -H 'Content-Type: application/json' -d '{"password":"<the panel password>"}'
```

`tls=0` is curl's "certificate verified"; never reach for `-k` here, because a working router with a
missing certificate is exactly the failure this check exists to catch. If a name will not resolve
from your machine while `dig @1.1.1.1 <name>` answers, it is your resolver's negative cache from
before the record existed, not a DNS fault — `--resolve <name>:443:<ip>` proves the stand while the
cache expires.

Unlock deserves both halves: a wrong password must answer **401** and the real one **200**. A route
that says 200 to anything is not a lock.

Then, the measurement S1 §8 and the plan note both call out as missing before touching stand two:

```bash
docker stats --no-stream kerbstone-postgres kerbstone-backend kerbstone-storefront
```

**Go/no-go for stands two to five:** multiply the three RSS figures by five and compare against the
host's free memory from step 0.3. If it does not fit, either trim `deploy/compose.stand.yml`'s
memory limits to match what was actually measured (they are a first guess, not a budget) and
re-check, or deploy fewer stands concurrently and ask Ivan which one waits — do not silently drop a
stand.

## The two demo logins

Every stand answers to the same two accounts, and **both are reconciled with the env file on every
backend boot** — created when missing, password updated when it differs, left alone when it already
matches:

| account | variables | where it is used |
|---|---|---|
| Medusa Admin | `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD` | `https://api-<stand>.upready.dev/app` |
| Storefront customer | `DEMO_CUSTOMER_EMAIL` / `DEMO_CUSTOMER_PASSWORD` | `https://<stand>.upready.dev/en/account` |

`docker-entrypoint.sh` step 4 runs `medusa exec ./src/scripts/ensure-accounts.js` after the
migrations and both seeds. Each account prints exactly one line, and those three words are the whole
vocabulary:

```
ensure-accounts: admin admin@upready.dev — created.
ensure-accounts: demo customer user@upready.dev — password updated.
ensure-accounts: admin admin@upready.dev — unchanged.
```

`unchanged` is not a guess: the script proves it by authenticating with the env password through the
same auth module `POST /auth/user/emailpass` uses, so a boot that says `unchanged` has just used the
login you are about to type. No password is ever printed.

**To change a password on a live stand:** edit the value in `deploy/stands/<stand>.env`, rsync
(step 2), `docker compose … up -d backend` — no rebuild, because these are runtime environment
variables, not build args. The next boot updates the auth identity in place; the account, its orders
and its addresses survive.

**Why this replaced `medusa user`.** That CLI has no "create if missing" mode
(`node_modules/@medusajs/medusa/dist/commands/user.js:57-77` — it raises on the duplicate email and
exits non-zero), so the entrypoint had to tolerate its failure on every boot after the first. The
tolerance hid the case that actually bit stand one: a password *changed* in the env file never
reached the database, and the stand kept answering to the one it had been created with, which is why
that database volume had to be dropped. Its replacement is idempotent by design, so its failure is
**not** tolerated — a stand whose accounts cannot be reconciled does not come up pretending they are
fine. Leaving a pair blank skips that account and logs one line saying so.

The demo customer is created exactly the way `POST /store/customers` creates one
(`createCustomerAccountWorkflow`): `has_account` true, first name Demo, last name User, linked to its
emailpass identity through `app_metadata.customer_id`. It is a normal registered customer — it can
place orders, and its orders show up in `/en/account/orders`.

## Rollback

- **Bad deploy on an already-working stand:** there is no `git checkout` on the host — the host tree
  is an rsync target, not a clone. Roll the **worktree** back to the last good commit, rsync again
  (step 2), then rebuild and restart the one service that changed (step 6 for the storefront,
  step 4 for the backend). The database survives either: migrations are additive and the seed
  no-ops on a seeded store.
- **The previous image is still on the host** until it is pruned, so the fastest rollback of a bad
  build is `docker image ls kerbstone-storefront` and `up -d --no-build` against the older tag —
  faster than a rebuild, and it needs no rsync at all.
- **Stand needs to come down entirely:**
  `docker compose -p kerbstone -f deploy/compose.stand.yml --env-file deploy/stands/kerbstone.env down`
  leaves the `kerbstone_db-data` volume in place (no `-v`); traefik stops routing the domain the
  moment the containers stop, before any DNS change.
- **Postgres volume needs to go too:** `-v` on the `down` above. On a stand that has served real
  visitors this is unrecoverable — ask Ivan first (rule 9). The one time this run did it, the
  volume was minutes old, had never served a visitor, and the reason is written down in the
  measured section; that is the bar.

## Stand one — measured 2026-09-10

Everything in this section is literal output from the live host and from a laptop on the public
internet, not a summary. Host time is CEST (UTC+2); the WITA timestamps in the run log are UTC+8.

### What was already standing when this run began

The Kerbstone tree was on the host at `/opt/upready-store/kerbstone`, the media at
`/opt/upready-store/media/sneakers` (2.7 MB), both DNS records live, and a `kerbstone-backend`
image built. The backend looked deployed and was not: it was crash-looping.

### The bug that made a broken stand look like a working one

```
$ docker inspect kerbstone-backend --format '{{.RestartCount}} {{.State.Status}} {{.State.ExitCode}}'
2 running 0

$ docker logs kerbstone-backend | grep -E '\[entrypoint\]|not found'
[entrypoint] running database migrations
[entrypoint] running the seed (no-op if this stand's store already exists)
[entrypoint] seeding the default block composition (no-op if one is saved)
[entrypoint] ensuring the admin user exists: admin@upready.dev
[entrypoint] admin user created
[entrypoint] starting: medusa start
/usr/local/bin/docker-entrypoint.sh: exec: line 62: medusa: not found
[entrypoint] running database migrations          <- the loop starts over
```

Every entrypoint step succeeded. The container then failed to `exec` its `CMD ["medusa", "start"]`,
exited, and `restart: unless-stopped` ran the whole sequence again ~40 s later, forever. The image's
`npm install --omit=dev` puts the CLI at `/app/node_modules/.bin/medusa`, which is on no default
PATH; the entrypoint's own steps only worked because they spell that path out.

Fix, in `apps/backend/Dockerfile`'s runtime stage — both halves, so neither reading surprises:

```dockerfile
ENV PATH="/app/node_modules/.bin:${PATH}"
CMD ["/app/node_modules/.bin/medusa", "start"]
```

Verified in the rebuilt image rather than in the build log:

```
$ docker image inspect kerbstone-backend:latest --format '{{json .Config.Cmd}} {{range .Config.Env}}{{println .}}{{end}}' | grep -E 'medusa|PATH'
["/app/node_modules/.bin/medusa","start"]
PATH=/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

### The database volume was dropped, deliberately

`kerbstone_db-data` was this run's own scratch state, created 15:55 UTC the same hour, and its admin
identity had been minted from a superseded `MEDUSA_ADMIN_PASSWORD` (the host's env copy predated
Ivan's decision). Since the stand had never served a visitor, the volume was dropped rather than
surgically edited, so that the first boot anyone can reproduce is a boot from the final env:

```
$ docker compose -p kerbstone ... down -v
 Volume kerbstone_db-data Removing
 Volume kerbstone_db-data Removed
$ docker volume ls | grep -c kerbstone   -> 0
$ docker volume ls -q | wc -l            -> 53   (every foreign volume untouched)
```

### First boot on the fixed image

```
$ docker inspect kerbstone-backend --format '{{.State.Health.Status}}|{{.RestartCount}}'
healthy|0

$ docker logs kerbstone-backend | grep -E '\[entrypoint\]|seed-storefront-settings|Server is ready'
[entrypoint] seeding the default block composition (no-op if one is saved)
seed-storefront-settings: seeded the "sneakers" default composition
  (header=h5, hero=k, tiles=off, listing=p2, footer=f3, defaultMode=dark).
[entrypoint] ensuring the admin user exists: admin@upready.dev
[entrypoint] admin user created
[entrypoint] starting: /app/node_modules/.bin/medusa start
Server is ready on port: 9000
```

Migrate to healthy took about 3 minutes 20 seconds, of which the seed is the bulk.

### The publishable key

```
$ docker exec kerbstone-postgres psql -U medusa -d medusa_kerbstone -tAc \
    "SELECT title, type, left(token,7), length(token) FROM api_key ORDER BY created_at;"
Kerbstone Publishable API Key|publishable|pk_090c|67
```

Written into the host env file and `scp`'d back to the worktree; both copies then hashed to
`ccf663bd307b2bd38623fc8d60a0f4d9`.

### Public verification, from a laptop, not from the host

```
GET  https://kerbstone.upready.dev/            -> 302  Location: https://kerbstone.upready.dev/en   tls_verify=0
GET  https://kerbstone.upready.dev/en          -> 200  611 204 bytes
GET  https://kerbstone.upready.dev/en/account  -> 200  536 306 bytes   <title>Sign in | Kerbstone</title>
GET  http://kerbstone.upready.dev/             -> 302  https://kerbstone.upready.dev/
GET  https://api-kerbstone.upready.dev/health  -> 200  OK
GET  https://api-kerbstone.upready.dev/app     -> 200  (admin UI)
GET  https://api-kerbstone.upready.dev/static/store-profiles/sneakers/flagstone-low-hero.webp
                                               -> 200  image/webp  165 564 bytes

certificate: issuer C=US, O=Let's Encrypt, CN=YR2
             subject CN=kerbstone.upready.dev
             notAfter Dec  8 15:25:52 2026 GMT

POST https://api-kerbstone.upready.dev/auth/user/emailpass  {admin@upready.dev, <password>}
                                               -> 200, body {"token": <432 chars>}

POST https://kerbstone.upready.dev/api/devtools/unlock  {"password": "<wrong>"}   -> 401
POST https://kerbstone.upready.dev/api/devtools/unlock  {"password": "<real>"}    -> 200 {"unlocked":true}
     set-cookie: upready_devtools=<redacted>; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=lax
GET  https://kerbstone.upready.dev/api/devtools/settings  (with that cookie)      -> 200
     {"settings":{"header":"h5","hero":"k","tiles":"off","listing":"p2","footer":"f3",
       "defaultMode":"dark","updatedAt":"2026-09-09T16:19:32.781Z"},"secretConfigured":true}
```

`"secretConfigured": true` is the proof that `STOREFRONT_SETTINGS_SECRET` reached **both** services
with the same value — the panel cannot save a composition without it, and nothing else on the stand
would have complained.

The served HTML carries the brand (308 occurrences of "Kerbstone", `<title>Kerbstone</title>`) and
points every product image at `https://api-kerbstone.upready.dev/static/store-profiles/sneakers/…`.

### One defect this stand is serving right now

The rendered page shows the literal string `Nav.modeToggleDark` where the visitor-facing
light/dark toggle's label belongs, and the storefront log carries
`Error: MISSING_MESSAGE: Nav.modeToggleDark (en)`. The key exists in no catalog yet — it belongs to
the visitor mode toggle and is due from the Locale stage, which fills all 36 catalogs. Nothing else
is missing: this is the only unresolved key on the page. It is cosmetic and visible.

### Footprint, and the go/no-go for stands two to five

```
$ docker stats --no-stream kerbstone-postgres kerbstone-backend kerbstone-storefront
NAME                   CPU %     MEM USAGE / LIMIT     MEM %
kerbstone-postgres     0.38%     114MiB / 512MiB       22.27%
kerbstone-backend      2.41%     331.1MiB / 2GiB       16.17%
kerbstone-storefront   71.32%    98.02MiB / 512MiB     19.14%

$ free -m
               total        used        free      shared  buff/cache   available
Mem:           11960        4838        3711         298        4023        7121
Swap:           4095         484        3611

$ df -h /      ->  193G total, 87G used, 107G available (45%)
$ docker images | grep kerbstone
kerbstone-storefront:latest   354MB
kerbstone-backend:latest      1.59GB
```

**One stand at rest costs ~543 MiB of RSS** (114 + 331 + 98). The storefront's 71% CPU is warm-up
from the verification requests, not a resting figure.

**Verdict: GO for four more stands on this host, but boot them one at a time.**

- Steady state is not the constraint: 4 × 543 MiB ≈ 2.2 GB against 7.1 GB available leaves room to
  spare even beside Coolify, agent-creatr, bpj-dev and verdaccio.
- **The boot is the constraint.** `docker-entrypoint.sh` loads the whole Medusa application four
  times before `medusa start` ever runs (migrate, catalog seed, composition seed, ensure-accounts),
  and Node 22 sizes its heap from the host's 11.9 GB rather than from the cgroup limit — which is
  why the backend's limit is 2 GB and not the 768 MB first guessed. Four backends seeding at once
  would contend for that headroom with nothing to gain, since the seeds are independent. Bring up
  one stand, wait for `healthy|0`, then start the next.
- Disk is comfortable: the five backend images are byte-identical builds and share their layers;
  only the storefront images diverge, because each bakes its own profile, URLs and publishable key
  at build time. 107 GB free against that is not close.
- The memory limits in `compose.stand.yml` should stay where they are. Postgres at 512 MB and the
  storefront at 512 MB each sit near 20% utilisation, and the backend's 2 GB exists for the boot
  peak, not for the 331 MiB it settles at.

### Credentials converged 2026-09-10 (package P-creds)

The entrypoint's `medusa user` step is gone; `medusa exec ./src/scripts/ensure-accounts.js` stands in
its place, and stand one now carries both demo logins. Literal output, in order.

Before the change, from a laptop:

```
POST https://api-kerbstone.upready.dev/auth/user/emailpass     {admin@upready.dev, supersecret}       -> 200
POST https://api-kerbstone.upready.dev/auth/user/emailpass     {admin@upready.dev, Upready-Demo-2026} -> 401
POST https://api-kerbstone.upready.dev/auth/customer/emailpass {user@upready.dev,  supersecret}       -> 401   <- no demo customer existed
GET  https://kerbstone.upready.dev/en                                                                 -> 200
```

Backend image rebuilt on the host (`… build backend`, detached, log
`/opt/upready-store/kerbstone-build-backend-creds.log`, last line `Image kerbstone-backend:latest
Built`), then `up -d --no-build backend`. First boot on the new image:

```
[entrypoint] converging the admin and demo-customer accounts onto the env values
ensure-accounts: admin admin@upready.dev — unchanged.
ensure-accounts: demo customer user@upready.dev — created (cus_01M23H4D1XAPG2FMJCENVTYHQG).
[entrypoint] starting: /app/node_modules/.bin/medusa start
Server is ready on port: 9000
docker inspect kerbstone-backend --format '{{.State.Health.Status}}|{{.RestartCount}}' -> healthy|0
```

The rows the script wrote, read straight out of Postgres:

```
$ docker exec kerbstone-postgres psql -U medusa -d medusa_kerbstone -tAF"|" \
    -c "SELECT email, has_account, first_name, last_name FROM customer ORDER BY created_at;"
user@upready.dev|t|Demo|User

$ … -c "SELECT ai.app_metadata::text, pi.provider, pi.entity_id FROM auth_identity ai
        JOIN provider_identity pi ON pi.auth_identity_id = ai.id ORDER BY ai.created_at;"
{"user_id": "user_01M23FFHC76J9YRM45E8FF1MQX"}|emailpass|admin@upready.dev
{"customer_id": "cus_01M23H4D1XAPG2FMJCENVTYHQG"}|emailpass|user@upready.dev
```

The **password-updated** branch was then exercised on the demo customer alone, with a throwaway
value, and converged back in the same minute — this is how to prove the branch on any stand without
leaving it wrong:

```
$ docker exec -e DEMO_CUSTOMER_PASSWORD=temp-probe-2026 kerbstone-backend \
    /app/node_modules/.bin/medusa exec ./src/scripts/ensure-accounts.js
ensure-accounts: demo customer user@upready.dev — password updated.
POST /auth/customer/emailpass {user@upready.dev, temp-probe-2026} -> 200
POST /auth/customer/emailpass {user@upready.dev, supersecret}     -> 401

$ docker exec kerbstone-backend /app/node_modules/.bin/medusa exec ./src/scripts/ensure-accounts.js
ensure-accounts: demo customer user@upready.dev — password updated.
POST /auth/customer/emailpass {user@upready.dev, supersecret}     -> 200
POST /auth/customer/emailpass {user@upready.dev, temp-probe-2026} -> 401
```

A second boot (`compose restart backend`) — the boot the old `medusa user` step always failed:

```
ensure-accounts: admin admin@upready.dev — unchanged.
ensure-accounts: demo customer user@upready.dev — unchanged.
docker inspect … '{{.State.Health.Status}}|{{.RestartCount}}' -> healthy|0
```

Final state, from a laptop, TLS verified, no `-k`:

```
POST /auth/user/emailpass     {admin@upready.dev, supersecret}       -> 200
POST /auth/user/emailpass     {admin@upready.dev, Upready-Demo-2026} -> 401
POST /auth/customer/emailpass {user@upready.dev,  supersecret}       -> 200
GET  https://kerbstone.upready.dev/en      -> 200  tls_verify=0
GET  https://api-kerbstone.upready.dev/app -> 200
```

### Runbook corrections this run made

1. Host layout is `/opt/upready-store/<stand>` reached by **rsync**, not `/opt/stands` reached by
   `git clone` + `git pull` — the branch is unpushed and the media is gitignored.
2. traefik entrypoints on this proxy are `http`/`https`, not `web`/`websecure`.
3. Every host build runs detached (`setsid nohup` + a log file), and the wait watches the **log**,
   never `pgrep` (which matches its own ssh command line and never returns zero).
4. `docker compose up` takes `--no-build` once the image is built, so a start cannot silently
   become a rebuild.
5. Health is read from `.State.Health.Status` **and** `.RestartCount`; a green log with a non-zero
   restart count is a crash loop wearing a disguise.
6. The env file's two copies are compared by digest after every rsync.
7. When waiting on a host build, do not anchor the grep: compose's own summary line is
   `Image <name>:latest Built ` **with a trailing space** (`tail -1 … | cat -A` ends `Built $`), so
   `grep -cE 'Built$'` returns 0 for a finished build and the wait runs to its deadline. Match
   `Built *$`, or watch for the image id instead.

## Stands two to five — measured 2026-09-10, and the script that ran them

Everything above is the manual runbook. `deploy/scripts/deploy-stand.sh` runs it end to end from
this machine for one stand and then performs the public verification; it is what deployed all
five stands on 2026-09-10 (stand one rebuilt with a fresh database, stands two to five new):

```bash
deploy/scripts/deploy-stand.sh kerbstone --fresh-db          # pg_dump backup, down -v, boot from the final env
deploy/scripts/deploy-stand.sh ferrite --backend-image-from kerbstone   # backend images are identical builds: tag, do not rebuild
deploy/scripts/deploy-stand.sh scruple --verify-only         # only the public checks
```

Flags: `--fresh-db`, `--backend-image-from <stand>`, `--skip-backend-build`,
`--skip-storefront-build`, `--verify-only`. Log: `.ai/deploy-logs/<stand>-<ts>.log` (gitignored).
The script never prints a secret; keys are reported by prefix and length.

What one stand costs with this script, measured on stands two to five (backend image tagged from
kerbstone, storefront image built on the host): rsync 30 s, backend boot to `healthy|0` 2 min 20 s
to 2 min 40 s (migrate + seed + composition + accounts), storefront build 2 min 30 s to 2 min 50 s,
verification 25 s — **about 7 minutes per stand**, one after another as the go/no-go above orders.

The public checks the script runs and every stand passed at 02:08–02:12 WITA (from a laptop, TLS
verified, no `-k`): `/en` 200, `/health` 200, `POST /auth/user/emailpass admin@upready.dev` 200,
`POST /auth/customer/emailpass user@upready.dev` 200, `/api/devtools/unlock` 401 on a wrong password
and 200 on the panel password, the profile's hero file and every category tile file on
`https://api-<stand>.upready.dev/static/store-profiles/<profile>/` 200, every tile the HTML
references 200, one product image through `/_next/image` 200, the profile the storefront image
BAKED contains `localhost` 0 times and the API domain ≥ 1 time, and `GET /store/pickup-points` with
the stand's publishable key returns 4 points.

Seeded compositions (from the entrypoint log, `seed-storefront-settings`): kerbstone h5·k·tiles
off·p2·f3·dark; ferrite h3·k·tiles on·p3·f5·dark; scruple h6·k·tiles off·p3·f6·light; larchant
h6·g·tiles off·p4·f6·light; long-morning h2·h·tiles on·p4·f4·light. Hero K is the announcement band
and carries no image — the absence of `home-hero.webp` in that HTML is by design, which is why the
script checks the profile's hero file and the baked profile instead.

Footprint with all five stands up (02:10 WITA, `docker stats --no-stream`): backends 228–291 MiB,
postgres 74–107 MiB, storefronts 88–182 MiB — **≈ 2.3 GB for five stands**; `free -m` available
6 257 MB of 11 960; disk 48 % of 193 GB. Images: one shared backend image (1.59 GB, tagged five
times) and five storefront images (≈ 354 MB each).

### The hero defect stand one served, and its cause

The first kerbstone build pointed the hero at `http://localhost:9023/static/store-profiles/sneakers/
home-hero.webp` while product images used `https://api-kerbstone.upready.dev/...`. Cause:
`apps/storefront/Dockerfile` ran a bare `npx next build`, which does not run the package.json
`prebuild` hook (`scripts/build-profile.mjs`), so the checked-in `profile.generated.json` — generated
locally against `localhost:9023` — was baked in. The Dockerfile now runs `build-profile.mjs`
explicitly and copies `specs/design-system` into the context (the theme build reads it; the font
pair differs per profile). Proof on every stand: `docker exec <stand>-storefront grep -c localhost
apps/storefront/src/lib/profile/profile.generated.json` → 0.

### Kerbstone's database was dropped a second time, with a backup

Pickup points seed only on a fresh store (`seedFulfillment`, all-or-nothing seed), and stand one had
been seeded before that package existed. Before `down -v` the script wrote
`/opt/upready-store/backups/kerbstone-20260910-013029.sql.gz` (3.4 MB, `pg_dump`); the volume had
held only seed data and the two demo accounts, both recreated on boot. Re-seeding minted a new
publishable key, which the script wrote into both env copies and baked into the rebuilt storefront.
