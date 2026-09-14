# Goal

Put today's `dev` on the live multi-tenant host and prove it is serving. This is deploy wave 1: it runs before
the client's shop is created, so the import task works against current code, and it proves the recipe works
before the day depends on it.

**Authorisation.** Rule 21c says deploy only on Ivan's command. His order of 2026-09-15 02:26 WITA
(`{{MISSION_DIR}}/MISSION.md`, verbatim) put the whole day under autonomous execution and named the live client
shop as the result. That is the command. Ivan's brake is the `STOP` file and the UI. Nothing else in this task
is discretionary: follow the recipe.

## Protected infrastructure — read before the first ssh

`~/upready/specs/protected-infra/registry.json`, entry `upready-store-mt-platform`, names what must survive:
the onboarding funnel `https://start.upready.dev/start/onboarding`, the panel
`https://panel-store.upready.dev`, the engine `https://shipshift.dev`, the tenant storefronts under
`*.shipshift.dev`, the database volume `mt_db-data` and the media directories. Read the entry and run its
`verify` commands at the end.

Never in this task: `docker compose down`, `stop`, `rm` of a container, `volume rm`, `rm -r` under
`/opt/upready-store`, a DNS change, a reboot. If a guard blocks a command, re-read what you typed before you
reach for the escape.

## The recipe (from `~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md`, lines 212-218 and 302-311, copied into `{{MISSION_DIR}}/research/upready-store-capabilities.md` §1)

Host: Contabo `84.46.251.149`, user `root`, ssh alias `contabo`, key `~/.ssh/id_ed25519_contabo`.
Code on the host: `/opt/upready-store/mt` (an rsync of the checkout, no `.git`). Compose project `mt`,
file `deploy/compose.mt.yml`, env `/opt/upready-store/mt/deploy/mt/shipshift.env` — the single copy of the
secrets, which lives only on the host.

```
# 0. one cheap liveness probe first (rule 5h: a silent host costs a full timeout on every later call)
ssh -o BatchMode=yes -o ConnectTimeout=5 contabo true; echo "ssh rc=$?"

# 1. env comes FROM the host (the copies have drifted); md5 before and after
scp root@84.46.251.149:/opt/upready-store/mt/deploy/mt/shipshift.env deploy/mt/shipshift.env && chmod 600 deploy/mt/shipshift.env

# 2. backup BEFORE anything else
ssh -n contabo 'docker exec mt-postgres pg_dump -U postgres -Fc medusa_mt > /opt/upready-store/backups/medusa_mt-$(date +%Y%m%d-%H%M%S).dump && ls -la /opt/upready-store/backups/ | tail -3'

# 3. code — rsync WITHOUT --delete
rsync -az --exclude node_modules --exclude .next --exclude .git --exclude .ai --exclude .turbo --exclude dist --exclude .medusa ./ contabo:/opt/upready-store/mt/

# 4. build detached into a log file on the host, then wait by deadline (rule 5h: stream to a FILE, one progress check)
ssh -n contabo 'cd /opt/upready-store/mt && setsid nohup docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env build backend storefront panel > /opt/upready-store/mt-build-$(date +%Y%m%d-%H%M%S).log 2>&1 < /dev/null & disown'

# 5. up
ssh -n contabo 'cd /opt/upready-store/mt && docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d'
```

After the backend image is rebuilt, run the backfills that the same memory records:

```
ssh -n contabo 'docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-hero-copy.js'
ssh -n contabo 'docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-option-translations.js'
```

`seed-mt-demo.js` is idempotent but only run it if the demo shops `acme`/`globex`/`initech` are missing.

## Step plan

1. `cd {{MAIN_CHECKOUT}}` — you are on `{{BASE}}`. `git fetch origin {{BASE}} && git status`. Record the exact
   commit you are deploying: `git rev-parse --short HEAD` and `git log --oneline -5`. That sha is what you
   report; never describe what is deployed from a diff (rule 17a).
2. Probe, pull the env, take the dump, rsync, build, up, backfill — in that order.
3. Watch the build log by deadline, not by polling: one `ssh -n contabo 'tail -40 <logfile>'` after a wait, and
   again only if it is still running. A build that has not finished in 25 minutes is a finding, not a reason to
   keep looking.
4. Health checks, all of them, with their status codes:

```
for u in https://shipshift.dev/health https://start.upready.dev/start/onboarding https://panel-store.upready.dev/ https://zolotaya-nit-1057.shipshift.dev/ru; do printf "%-55s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 25 -L "$u"; done
ssh -n contabo 'docker ps --format "{{.Names}}\t{{.Status}}" | sort'
ssh -n contabo 'docker images --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}" | grep -i mt | head'
```

   The image timestamp is how you prove the new code is running: there is no `.git` on the host.
5. If a check fails, do not leave the platform broken. The safe recovery is to rebuild and `up -d` again; if
   that does not help, report `RESULT: FAIL` with the failing URL, the container status and the last 40 lines
   of the relevant container log. Do not try to roll back by deleting anything.

## Acceptance

All four URLs return 200, every `mt-*` container is `Up`, the image `CreatedAt` is within this run, and the
deployed sha is named. The dump file exists and its size is printed.

## Finish

Write a short report to `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md`: the sha, the dump path and size, the
four status codes, the container list, the image timestamps, and anything that surprised you. Then print:

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK deploy <sha> — 4/4 health checks 200
```

or `RESULT: FAIL <what exactly failed>` as the very last line.

## What NOT to do

- Do not push, do not merge, do not commit product code. Journals on `{{BASE}}` only, and those need
  `BASE_COMMIT_OK=1` next to `IVAN_OK=1`.
- Do not edit `shipshift.env` on the host. If a variable is missing, that is a finding for the report.
- Do not run `docker compose down`, do not prune, do not remove a volume or an image.
- Do not create the client's tenant here. That is `x01-tenant-live-import`.
