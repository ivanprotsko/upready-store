#!/usr/bin/env bash
# The operational restore drill (t-cherk-36, backup-spec.md section 5's
# "приёмка = совпадение счётчиков" applied to the platform-level dump rather
# than a per-tenant bundle). Restores the NEWEST real dump in
# BACKUP_TARGET_DIR into a throwaway database via pg-restore.sh, then row-
# counts a handful of tables that must exist on any seeded mt database, and
# drops the throwaway database. Unlike test-backup-restore.sh (which seeds
# its own synthetic table and proves the dump/restore mechanics on any
# Postgres server, including CI), this drill proves that the LATEST actual
# backup this host produced is restorable and plausible — the check
# RUNBOOK.md's "Verifying a backup is real" section asks an operator to run
# by hand, automated and non-zero-exiting on failure.
#
# Usage:
#   deploy/backup/restore-drill.sh
#
# Required environment:
#   BACKUP_TARGET_DIR         directory pg-backup.sh / nightly-run.sh wrote
#                              the dump into.
#   TEST_ADMIN_DATABASE_URL   a postgres:// URL to an EXISTING database on
#                              the target server (its own contents are never
#                              touched), used only as the connection this
#                              script issues CREATE DATABASE / DROP DATABASE
#                              from — same contract as
#                              test-backup-restore.sh's own variable of the
#                              same name. This script always restores
#                              through pg-restore.sh's DIRECT mode (it needs
#                              --create, which pg-restore.sh's docker-exec
#                              mode does not support), so the server named
#                              here must be reachable by a plain postgres://
#                              URL. On the mt host, mt-postgres has no
#                              published port — run this from a container on
#                              the same docker network, or publish a
#                              temporary 127.0.0.1-only port for the drill
#                              and remove it afterward (see RUNBOOK.md).
# Optional:
#   DB_BACKUP_LABEL        filename prefix to look for. Default "medusa"
#                           (matches pg-backup.sh's own default, and
#                           nightly-run.sh's DB_BACKUP_LABEL when set).
#   DRILL_TABLES            comma-separated table names to row-count.
#                           Default "tenant,product,order,customer" — the
#                           four tables RUNBOOK.md's own manual verification
#                           query already checks.
#   DRILL_ALLOW_ALL_EMPTY   set to "1" to NOT fail when every checked table
#                           comes back with zero rows (a legitimately fresh,
#                           never-seeded database). Default off: an all-zero
#                           result on what should be a live backup is the
#                           same class of silent failure as the RUNBOOK's
#                           `pg_dump -U postgres` pitfall — a dump that reads
#                           back fine but never had real data in it.
#   PG_RESTORE_BIN, PSQL_BIN   same meaning as in pg-restore.sh.
#
# Exit codes:
#   0  restored, every table queried without error, and at least one had rows
#      (or DRILL_ALLOW_ALL_EMPTY=1)
#   1  usage or configuration error, or a client/server major version
#      mismatch (bubbled from pg-restore.sh)
#   2  no dump file found under BACKUP_TARGET_DIR for DB_BACKUP_LABEL
#   3  setup (create the throwaway database) failed
#   4  pg-restore.sh failed (checksum mismatch, --create failure, or
#      pg_restore itself failing — see its own exit codes)
#   5  a table in DRILL_TABLES could not be queried (restore left the schema
#      incomplete), or every table came back empty and
#      DRILL_ALLOW_ALL_EMPTY is not set
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[restore-drill] $*" >&2; }

if [[ -z "${BACKUP_TARGET_DIR:-}" ]]; then
  log "error: BACKUP_TARGET_DIR is not set"
  exit 1
fi
if [[ -z "${TEST_ADMIN_DATABASE_URL:-}" ]]; then
  log "error: TEST_ADMIN_DATABASE_URL is not set"
  exit 1
fi

DB_BACKUP_LABEL="${DB_BACKUP_LABEL:-medusa}"
DRILL_TABLES="${DRILL_TABLES:-tenant,product,order,customer}"
PSQL_BIN="${PSQL_BIN:-psql}"

DUMP_FILE="$(find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${DB_BACKUP_LABEL}-*.dump" -print 2>/dev/null | sort -r | head -n1)"
if [[ -z "$DUMP_FILE" ]]; then
  log "error: no ${DB_BACKUP_LABEL}-*.dump file found under $BACKUP_TARGET_DIR"
  exit 2
fi
log "newest dump: $DUMP_FILE"

RUN_ID="$$_$(date +%s)"
DRILL_DB="restore_drill_${RUN_ID}"
SERVER_URL="${TEST_ADMIN_DATABASE_URL%/*}"
DRILL_URL="${SERVER_URL}/${DRILL_DB}"

cleanup() {
  "$PSQL_BIN" "$TEST_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "restoring into throwaway database $DRILL_DB"
if ! "$SCRIPT_DIR/pg-restore.sh" "$DUMP_FILE" "$DRILL_URL" --create; then
  log "error: pg-restore.sh failed"
  exit 4
fi

IFS=',' read -r -a TABLES <<<"$DRILL_TABLES"
TOTAL_ROWS=0
for table in "${TABLES[@]}"; do
  count="$("$PSQL_BIN" "$DRILL_URL" -t -A -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"$table\";" 2>&1)" || {
    log "error: could not query table \"$table\" on the restored database: $count"
    exit 5
  }
  log "table \"$table\": $count row(s)"
  TOTAL_ROWS=$((TOTAL_ROWS + count))
done

if [[ "$TOTAL_ROWS" -eq 0 && "${DRILL_ALLOW_ALL_EMPTY:-}" != "1" ]]; then
  log "error: every checked table (${DRILL_TABLES}) is empty — looks like an empty or wrong-source" \
    "dump, not a fresh-but-legitimate database (set DRILL_ALLOW_ALL_EMPTY=1 to allow this)"
  exit 5
fi

log "PASS: $DUMP_FILE restores cleanly, $TOTAL_ROWS total row(s) across ${#TABLES[@]} table(s)"
