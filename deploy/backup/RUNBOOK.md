# Postgres Backup Runbook (Audit D-01)

Closes audit finding D-01 (Critical): the live host has no regular dump, no retention and no proven
restore path. `docs/multitenancy/backup-spec.md` describes the per-tenant JSON export as a fourth,
logical layer on top of a platform backup that this runbook assumes exists; before this file, tier 1
of that platform backup (rule 42a: `<project>/backups/` on the host itself) did not exist either. The
only dump anywhere in the repository was the side effect of `deploy/scripts/deploy-stand.sh
--fresh-db`, taken at the moment a stand's database is deliberately destroyed, which is not a backup.

Nothing in this runbook has been run against the live mt host. `deploy/backup/pg-backup.sh` and
`deploy/backup/pg-restore.sh` are read from this repository; installing the cron job or timer below
is a deploy action against production and needs Ivan's separate go-ahead, the same way any other
change to the live host does.

## What the two scripts do

- `deploy/backup/pg-backup.sh` — `pg_dump -Fc` (custom format: compressed, and the only format
  `pg_restore -l` can list without a full restore), a `sha256` sidecar next to the dump, a
  `pg_restore -l` sanity check before declaring success, then deletes dumps older than the retention
  window. Full option reference is in the script's own header comment.
- `deploy/backup/pg-restore.sh` — verifies the sidecar, then `pg_restore`s into a target database
  (optionally creating it first). Full option reference is in the script's own header comment.
- `deploy/backup/test-backup-restore.sh` — an automated restore drill against any reachable Postgres
  server: creates a throwaway source database, seeds it, backs it up, restores into a second
  throwaway database, compares row counts, drops both. Does not touch any project database.

Both scripts talk to Postgres two ways: a `DATABASE_URL` pg_dump/pg_restore can reach directly, or a
`docker exec` into a named container when Postgres has no published port. **The live mt host is the
second case:** `deploy/compose.mt.yml` keeps `mt-postgres` on the internal `coolify` network only, no
`ports:` mapping, so `pg_dump`/`pg_restore` must run inside the container.

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

## Installing on the host (NOT done by this task)

SSH access: `ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP` (host layout
and access are `deploy/README.md`; the mt-specific deploy recipe is
`~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md`, since `deploy/README.md` itself
documents the five single-tenant stands, not mt).

1. Copy this directory to the host (it already rsyncs with the rest of the tree by the normal mt
   deploy recipe: `rsync -az … ./ contabo:/opt/upready-store/mt/`, no separate step needed once this
   PR is deployed).
2. Wrapper script on the host, `/opt/upready-store/mt/deploy/backup/run-nightly.sh` (not checked in:
   it names the live container and database, which belong to the host, not the repository):

   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd /opt/upready-store/mt
   export BACKUP_TARGET_DIR=/opt/upready-store/backups/mt
   export PG_DUMP_DOCKER_CONTAINER=mt-postgres
   export PG_DUMP_DB_USER=medusa
   export PG_DUMP_DB_NAME=medusa_mt   # or the host's actual $DB_NAME if it overrides the compose default
   export RETENTION_DAYS=7
   export BACKUP_LABEL=mt
   ./deploy/backup/pg-backup.sh
   ```

   `chmod 600` it if it ever carries a value that is not already public in `deploy/compose.mt.yml`
   (today it does not need any secret: the role name and database name are not secrets, and
   `docker exec` runs as the container's own `postgres` superuser context, no password needed).

3. Cron, on the host (`crontab -e` as `root`, since only `root` can `docker exec`):

   ```cron
   0 19 * * * /opt/upready-store/mt/deploy/backup/run-nightly.sh >> /opt/upready-store/backups/mt-backup.log 2>&1
   ```

   `0 19 * * *` matches the timezone note already on record for the per-tenant job
   (`backup-spec.md` section 2): cron time = process time, no timezone awareness, so this runs at
   03:00 the host's local next day only if the host's clock is UTC+8. Confirm with `date` on the host
   before trusting the hour; adjust the cron field instead of guessing.

   A systemd timer is the alternative if this host standardizes on systemd units elsewhere:

   ```ini
   # /etc/systemd/system/mt-pg-backup.service
   [Unit]
   Description=Nightly Postgres backup for mt

   [Service]
   Type=oneshot
   ExecStart=/opt/upready-store/mt/deploy/backup/run-nightly.sh
   ```

   ```ini
   # /etc/systemd/system/mt-pg-backup.timer
   [Unit]
   Description=Run mt-pg-backup daily

   [Timer]
   OnCalendar=*-*-* 19:00:00
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

   `Persistent=true` catches up a missed run after a host reboot, which plain cron does not.

4. First run by hand, watch it end to end, before trusting the schedule:

   ```bash
   ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP \
     '/opt/upready-store/mt/deploy/backup/run-nightly.sh'
   ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_contabo root@$CONTABO_SERVER_IP \
     'ls -la /opt/upready-store/backups/mt/'
   ```

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

## Local restore drill performed for this hotfix

`/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/night-20260924/w2/d01-restore-check.txt`
records a real run against the local stand database `upready_store_t2026092101` (127.0.0.1:5433,
read-only): dumped, restored into a new scratch database `upready_store_restore_check`, row counts of
`tenant`, `product`, `order` and `customer` matched exactly, scratch database dropped. That is the
drill this runbook asks an operator to repeat against the live host's data once tier 1 is installed
there.
