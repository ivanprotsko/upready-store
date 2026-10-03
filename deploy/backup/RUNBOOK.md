# Postgres Backup Runbook (Audit D-01)

Closes audit finding D-01 (Critical): the live host has no regular dump, no retention and no proven
restore path. `docs/multitenancy/backup-spec.md` describes the per-tenant JSON export as a fourth,
logical layer on top of a platform backup that this runbook assumes exists; before this file, tier 1
of that platform backup (rule 42a: `<project>/backups/` on the host itself) did not exist either. The
only dump anywhere in the repository was the side effect of `deploy/scripts/deploy-stand.sh
--fresh-db`, taken at the moment a stand's database is deliberately destroyed, which is not a backup.

Nothing in this runbook has been run against either live host. Every script below is read from this
repository; installing the timer, cron job or cross-host copy is a deploy action against production
and needs Ivan's separate go-ahead, the same way any other change to a live host does — on the mt
stack that installation step is t-cherk-16, not this task.

**Two hosts, since 2026-10-02 (t-cherk-36).** Ivan bought a second, Russian cloud server so the
`.ru` shop's data (152-FZ) and a cross-host backup copy both exist (order o-20260921-01, plan
`cherkashino-two-shops`). `nightly-run.sh` still runs independently on each host — there is no shared
state between them — and `cross-copy.sh` is what makes each host hold a copy of the OTHER host's
latest backup, so losing either host alone loses no data. `pg-backup.sh`, `pg-restore.sh`,
`test-backup-restore.sh` and `version-guard.sh` are the original D-01 scripts and are unchanged by
this task.

## What each script does

Produced on one host, per run:
- `deploy/backup/pg-backup.sh` — `pg_dump -Fc` (custom format: compressed, and the only format
  `pg_restore -l` can list without a full restore), a `sha256` sidecar next to the dump, a
  `pg_restore -l` sanity check before declaring success, then deletes dumps older than its own flat
  retention window. Full option reference is in the script's own header comment.
- `deploy/backup/media-backup.sh` — the same shape for files instead of rows: `tar -czf` one or more
  host directories (the mt stack's tenant uploads, `TENANT_MEDIA_HOST_PATH` in
  `deploy/compose.mt.yml` — not the demo-catalog `MEDIA_HOST_PATH`, which the repository can
  regenerate), a `sha256` sidecar, a `tar -tzf` sanity check, then its own flat retention prune.

Orchestrating a night on one host:
- `deploy/backup/nightly-run.sh` — the one entrypoint a timer or cron job calls. Runs
  `pg-backup.sh` then `media-backup.sh`, sanity-checks each fresh file with `sanity-check.sh` (too
  small, too old, or shrunk more than `MAX_SHRINK_PERCENT` versus the previous run — all three catch
  the class of bug `~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md` already
  documents once, a dump or archive that "succeeds" but is quietly wrong), then rotates both pools
  with `rotate-backups.sh`'s grandfather-father-son scheme instead of either script's own flat
  window. Stops at the first failure (fails loudly, exits non-zero) rather than continuing past a bad
  artifact. Full env var reference, including why it overrides `RETENTION_DAYS` for the two scripts
  above itself, is in its own header comment.

Between the two hosts:
- `deploy/backup/cross-copy.sh` — rsyncs the newest dump and media archive (and their sidecars) to
  the OTHER host over ssh, prunes old copies there, and optionally pushes the same files to an
  S3-compatible bucket (Timeweb Cloud / Selectel) when `S3_ENABLED=1`. Meant to run only after
  `nightly-run.sh` exits 0 — see "Installing on a host" below for how `install.sh` chains the two.

Verifying a backup is restorable, not just present:
- `deploy/backup/pg-restore.sh` — verifies the dump's sidecar, then `pg_restore`s into a target
  database (optionally creating it first). Full option reference is in the script's own header
  comment.
- `deploy/backup/restore-drill.sh` — restores the newest REAL dump from `BACKUP_TARGET_DIR` into a
  throwaway database (via `pg-restore.sh`), row-counts `tenant`, `product`, `order` and `customer` by
  default, and fails if a table cannot be queried or if every table comes back empty. This is the
  automated version of "Verifying a backup is real" below, run against this host's actual latest
  backup rather than a synthetic one.
- `deploy/backup/test-backup-restore.sh` — unchanged from D-01: an automated drill against any
  reachable Postgres server using a synthetic table, so the dump/restore mechanics can be proven in
  CI or on a laptop without a Medusa database at hand.

Installing the above as a timer, cron job, or both:
- `deploy/backup/install.sh` — writes the wrapper script, and the systemd timer+service (preferred)
  or crontab line, that runs `nightly-run.sh` (and, with `--with-cross-copy`, `cross-copy.sh`) on a
  schedule; optionally a second timer/cron job for `restore-drill.sh` with `--install-drill-timer`.
  Only ever writes files and runs `systemctl`/`crontab` — it is the automation of the "Installing on a
  host" steps below, not a new action beyond them.

`pg-backup.sh`, `pg-restore.sh` and `test-backup-restore.sh` (and `restore-drill.sh`, through
`pg-restore.sh`) refuse to run, in `DATABASE_URL` mode, when the `pg_dump`/`pg_restore` binary's
major version differs from the server's (`deploy/backup/version-guard.sh`): measured 2026-09-24, a
Homebrew `libpq` client at 18.6 against this stand's 16.13 server produced a dump that then failed to
restore with `unrecognized configuration parameter "transaction_timeout"`, because pg_dump 18 embeds
a GUC that does not exist before Postgres 17. Point `PG_DUMP_BIN`/`PG_RESTORE_BIN`/`PSQL_BIN` at a
client from the server's own major version, or use `PG_DUMP_DOCKER_CONTAINER`/`PG_RESTORE_DOCKER_CONTAINER`
(docker-exec mode is never affected: the client lives inside the server's own image).

A host with no pg client at all (contabo, measured 2026-10-04) still needs one binary: pg-backup.sh's
`pg_restore -l` sanity check runs on the host, not in the container, and exits 4 without it.
[pg-restore-docker.sh](./pg-restore-docker.sh) is that binary: it runs `pg_restore` inside a throwaway
`postgres:16-alpine` container with the dump bind-mounted read-only at the same path, so
`PG_RESTORE_BIN=/opt/upready-store/pg-restore-docker.sh` (or a symlink at `/usr/local/bin/pg_restore`,
which is what contabo has) makes the check pass unchanged.

`pg-backup.sh` and `pg-restore.sh` talk to Postgres two ways: a `DATABASE_URL` they can reach
directly, or a `docker exec` into a named container when Postgres has no published port. **The live
mt host is the second case:** `deploy/compose.mt.yml` keeps `mt-postgres` on the internal `coolify`
network only, no `ports:` mapping, so `pg_dump`/`pg_restore` must run inside the container —
`restore-drill.sh` is the one script in this list that cannot use that mode (see "Verifying a backup
is real" below for why).

## Where dumps go: the three tiers of rule 42a

`~/r/42a.md`: `<project>/backups/` (7 days) -> `~/upready/backups/<project>/` (30 days) -> R2/restic
encrypted (90 days + monthly). This runbook installs tier 1 on the host. Tiers 2 and 3 move the file
off the host entirely, which is what survives the host itself being lost; they are follow-up work
(off-host sync target and R2/restic credentials on a production host are Ivan's decisions, not a
default this runbook should assume), tracked separately from this hotfix. Until tier 2/3 exist, tier
1 alone is what this runbook gives the host: a local dump survives an accidental `DROP DATABASE` or a
bad migration, not a lost or compromised host.

On the mt host, tier 1 is `/opt/upready-store/backups/mt/` (parallel to the existing
`/opt/upready-store/backups/` the `--fresh-db` flag already writes to, kept in its own subdirectory
so the two are never confused about which dumps are routine and which are pre-destroy safety nets).
`cross-copy.sh` adds a cross-host copy of tier 1 under `CROSS_COPY_REMOTE_DIR` on the OTHER host
(default `/opt/upready-store/backups/cross-copy/`, kept apart from that host's OWN tier 1 so an
operator never confuses "this host's own last night" with "what the other host sent over").

## Installing on a host (NOT done by this task)

SSH access: `ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP` for contabo
(host layout and access are `deploy/README.md`; the mt-specific deploy recipe is
`~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md`, since `deploy/README.md` itself
documents the five single-tenant stands, not mt). The Russian host's own key and IP are the lead's,
once t-cherk-03/t-cherk-25 stand it up — not written here, since this task never touched a live host.

1. Copy this directory to the host (it already rsyncs with the rest of the tree by the normal mt
   deploy recipe: `rsync -az … ./ contabo:/opt/upready-store/mt/`, no separate step needed once this
   PR is deployed — the same rsync reaches the Russian host once it exists).
2. On the host, copy the template and fill it in:

   ```bash
   cp deploy/backup/nightly.env.example deploy/backup/mt.env
   chmod 600 deploy/backup/mt.env
   # edit deploy/backup/mt.env — see the template's own comments for every variable
   ```

   Nothing in it needs to be a secret today for the mt stack's DB (the role and database name are
   not secrets, and `docker exec` runs as the container's own context) — `chmod 600` is future-proofing
   for the day a value here does need to be, and for `CROSS_COPY_SSH_KEY` and the S3 credentials if
   those are ever inlined rather than left to `~/upready/.env.keys`.
3. Run `install.sh` — preferred over the hand-written wrapper the first version of this runbook
   documented, because it writes the wrapper, the systemd timer+service (or the crontab line), AND
   registers them in one step:

   ```bash
   deploy/backup/install.sh \
     --project-dir /opt/upready-store/mt \
     --env-file /opt/upready-store/mt/deploy/backup/mt.env \
     --with-cross-copy
   ```

   Add `--dry-run` first to see exactly what it would write and run, without writing or running
   anything — this is also how this task tested the script, since installing for real is t-cherk-16,
   not this one. `--mode` forces `systemd` or `cron` instead of auto-detecting `systemctl` on PATH;
   `--schedule` overrides the default `*-*-* 03:00:00` (systemd) / `0 3 * * *` (cron) — see the
   timezone note below before trusting either default. `install.sh --help`-equivalent detail (every
   flag, every exit code) is in the script's own header comment.

   A systemd timer this installs, read back, looks like:

   ```ini
   # /etc/systemd/system/mt-backup.service
   [Unit]
   Description=Nightly backup for mt-backup (t-cherk-36)

   [Service]
   Type=oneshot
   WorkingDirectory=/opt/upready-store/mt
   ExecStart=/opt/upready-store/mt/deploy/backup/.generated/run-mt-backup.sh
   ```

   ```ini
   # /etc/systemd/system/mt-backup.timer
   [Unit]
   Description=Run mt-backup on a schedule

   [Timer]
   OnCalendar=*-*-* 03:00:00
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

   `Persistent=true` catches up a missed run after a host reboot, which plain cron does not.
   `OnCalendar`/the cron field is process-local time, no timezone awareness (same note the per-tenant
   job's own spec already makes, `backup-spec.md` section 2) — confirm with `date` on the host before
   trusting the hour.

4. First run by hand, watch it end to end, before trusting the schedule:

   ```bash
   ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP \
     '/opt/upready-store/mt/deploy/backup/.generated/run-mt-backup.sh'
   ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP \
     'ls -la /opt/upready-store/backups/mt/'
   ```

5. Repeat steps 1-4 on the OTHER host, pointing `CROSS_COPY_SSH_HOST` in each host's `mt.env` at the
   other one, before trusting either side's cross-copy. An S3-compatible third copy (Timeweb Cloud /
   Selectel) is `S3_ENABLED=1` plus `S3_ENDPOINT_URL`/`S3_BUCKET`/`S3_PREFIX` in the same env file —
   off by default, and optional even once the second host exists.
6. Optionally, `--install-drill-timer "<schedule>"` on `install.sh`'s invocation above installs
   `restore-drill.sh` on its own schedule (a weekly `OnCalendar`/cron expression is a reasonable
   start). Off by default: restoring real data nightly is heavier than dumping it, so "Verifying a
   backup is real" below defaults to a monthly, operator-read run instead of an unattended one — see
   that section's own note on why `restore-drill.sh` cannot reach `mt-postgres` through `docker exec`
   alone.

## Restoring

**Never restore onto the live database to "check" a backup.** Restore into a new, empty database
(local mode: `pg-restore.sh <dump> <target-url> --create`) or, on the host, into a database that is
not the one serving traffic.

Live incident recovery (an operator's call, not a default script run):

```bash
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP
cd /opt/upready-store/mt
LATEST=$(ls -t /opt/upready-store/backups/mt/*.dump | head -1)
docker cp "$LATEST" mt-postgres:/tmp/restore.dump
docker exec -i mt-postgres sh -c "sha256sum -c $(basename "$LATEST").sha256" < /opt/upready-store/backups/mt/$(basename "$LATEST").sha256
# stop the app from writing during the restore window (docker compose -p mt stop backend), THEN:
PG_RESTORE_DOCKER_CONTAINER=mt-postgres PG_RESTORE_DB_USER=medusa PG_RESTORE_DB_NAME=medusa_mt \
  SKIP_CHECKSUM_CHECK=1 \
  ./deploy/backup/pg-restore.sh /tmp/restore.dump
docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env start backend
```

`SKIP_CHECKSUM_CHECK=1` above because the checksum was already verified with the direct `sha256sum -c`
call against the file inside the container (the script's own checksum check expects the sidecar next
to the dump on the same filesystem it reads the dump from, and here the dump was copied into the
container without its sidecar).

## Verifying a backup is real, not just present

A non-empty file is not proof (see the `pg_dump -U postgres` pitfall in
`~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md`: the wrong role name silently
produces a legal, empty dump). `pg-backup.sh` already runs `pg_restore -l` on every dump and fails the
run if it lists zero objects; that is the automatic half of verification. The manual half, done at
least monthly (backup-spec.md section 5's "приёмка = совпадение счётчиков"):

```bash
deploy/backup/pg-restore.sh <dump> <scratch-database-url> --create
psql <scratch-database-url> -c "select 'tenant', count(*) from tenant
  union all select 'product', count(*) from product
  union all select 'order', count(*) from \"order\"
  union all select 'customer', count(*) from customer;"
# compare against the same query against the live database, then drop the scratch database
```

`deploy/backup/test-backup-restore.sh` automates exactly this shape against a throwaway table instead
of the real schema, so it can run in CI or on a laptop without a Medusa database at hand:

```bash
TEST_ADMIN_DATABASE_URL=postgres://<user>@<host>:<port>/postgres deploy/backup/test-backup-restore.sh
```

`deploy/backup/restore-drill.sh` (t-cherk-36) automates the query above against the newest REAL dump
in `BACKUP_TARGET_DIR` instead of a throwaway table, non-zero exit on any table failing to query or
on every table coming back empty:

```bash
BACKUP_TARGET_DIR=/opt/upready-store/backups/mt DB_BACKUP_LABEL=mt-db \
  TEST_ADMIN_DATABASE_URL=postgres://<user>@<host>:<port>/postgres \
  deploy/backup/restore-drill.sh
```

**On the mt host specifically, this needs a server `restore-drill.sh` can reach by a plain
`postgres://` URL.** It restores through `pg-restore.sh`'s direct mode (the only one that supports
`--create`), and `mt-postgres` has no published port (`deploy/compose.mt.yml`). Run it from a
container already on the `coolify`/`mt-private` network, or publish a temporary
`127.0.0.1`-only port for the duration of the drill and remove it again afterward — this is why
"Installing on a host" above leaves `--install-drill-timer` off by default rather than assuming it
works unattended on this topology.

## Dumping One Shop Without the Others

A whole-platform dump carries every shop. When one shop moves to a server of its own,
[`deploy/scripts/tenant-only-dump.sh`](../scripts/tenant-only-dump.sh) restores the live database
into a marked temporary database inside `mt-postgres`, cuts every other shop out in one checked
transaction, dumps what is left to `/opt/upready-store/backups/tenant-only/`, drops the temporary
database and lists the shop's media for rsync. Nothing is written to `medusa_mt`.

```bash
deploy/scripts/tenant-only-dump.sh olavka --dry-run   # counts only, rolled back
deploy/scripts/tenant-only-dump.sh olavka
```

The rules and checks are in
[`apps/backend/src/scripts/tenant-only/README.md`](../../apps/backend/src/scripts/tenant-only/README.md).

## Local test run performed for t-cherk-36

Every script above was run against this machine's own local Postgres 16 (`127.0.0.1:5433`, rule 5zb —
no Docker, no VM), never against a live host:

- `nightly-run.sh` end to end against a scratch database shaped like a real one (`tenant`, `product`,
  `"order"`, `customer` tables, a handful of rows each) and two fixture media directories: produced a
  dump and a `tar.gz`, sanity-checked both, rotated both pools. Exit 0.
- The same run with a deliberately tiny media fixture (463 bytes) against the default 1024-byte floor:
  `sanity-check` caught it and the whole run exited 5, without rotating anything — proving the "fails
  loudly" requirement rather than just asserting it.
- `restore-drill.sh` against the dump that run produced: restored into a throwaway database, row-
  counted all four tables, exit 0. Then the same dump's bytes were corrupted in place (its sidecar
  left stale on purpose): `pg-restore.sh`'s checksum check caught the mismatch and the drill exited 4
  — the brief's "a corrupted dump makes the drill fail" requirement.
- `rotate-backups.sh`'s GFS function against 40 synthetic dated files with `daily=7 weekly=4`: kept
  exactly 11 (7 newest + 4 spaced every 7th position), matching the scheme's own arithmetic.
- `sanity-check.sh`'s function against five scenarios by hand (healthy, too small, too old, shrunk
  more than 50% versus the previous run, and the shrink check explicitly disabled) — each returned
  the exit code its own header comment promises.
- `install.sh --dry-run` in both `--mode systemd` and `--mode cron`, including `--with-cross-copy` and
  `--install-drill-timer`, to see the exact unit files / crontab line it would write. Then, pointed at
  a scratch directory with `UNIT_DIR`/`SYSTEMCTL_BIN`/`CRONTAB_BIN` overridden to stub binaries (never
  a real systemd unit or this machine's own crontab), a real (non-dry-run) write: the wrapper landed
  executable, the unit files landed with the right `ExecStart`, the stub `systemctl`/`crontab` were
  invoked with the right arguments, and a second `--mode cron` run with a different `--schedule`
  replaced the one crontab line rather than duplicating it.
- `cross-copy.sh` is shellcheck-clean and was reviewed line by line, but was NOT run against a real
  second host: the Russian server this task's brief describes had not been bought yet when this task
  ran (t-cherk-03), and enabling passwordless SSH to test against `localhost` would have been a
  system change to Ivan's Mac outside this task's scope. Exercising it for real is part of t-cherk-16.

[d01-restore-check.txt](/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/night-20260924/w2/d01-restore-check.txt)
records the original D-01 local drill (dump/restore mechanics only, before t-cherk-36's additions):
a real run against the local stand database `upready_store_t2026092101`, row counts of `tenant`,
`product`, `order` and `customer` matched exactly after restore, scratch database dropped.
