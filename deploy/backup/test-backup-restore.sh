#!/usr/bin/env bash
# Automated restore drill for pg-backup.sh / pg-restore.sh (audit finding
# D-01, backup-spec.md section 5: "приёмка = совпадение счётчиков"). Creates
# a throwaway source database, seeds it, backs it up, restores the backup
# into a second throwaway database, compares row counts, then drops both.
# Runs against any reachable Postgres server, not tied to one project's
# database, so it is safe to run in CI or on a laptop.
#
# Usage:
#   deploy/backup/test-backup-restore.sh
#
# Required environment:
#   TEST_ADMIN_DATABASE_URL   a postgres:// URL to an EXISTING database on
#                             the target server (its own contents are never
#                             touched) used only as the connection this
#                             script issues CREATE DATABASE / DROP DATABASE
#                             from, e.g. postgres://user@127.0.0.1:5433/postgres
#
# Optional:
#   PG_DUMP_BIN, PG_RESTORE_BIN, PSQL_BIN   same meaning as in the two
#                                            scripts this test drives.
#
# Exit codes:
#   0  row counts matched after restore
#   1  usage or configuration error
#   2  setup (create/seed source database) failed
#   3  pg-backup.sh failed
#   4  pg-restore.sh failed
#   5  row counts did not match
set -euo pipefail

log() { echo "[test-backup-restore] $*" >&2; }

if [[ -z "${TEST_ADMIN_DATABASE_URL:-}" ]]; then
  log "error: TEST_ADMIN_DATABASE_URL is not set"
  exit 1
fi

PSQL_BIN="${PSQL_BIN:-psql}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_ID="$$_$(date +%s)"
SRC_DB="pgbackup_test_src_${RUN_ID}"
TGT_DB="pgbackup_test_tgt_${RUN_ID}"
SERVER_URL="${TEST_ADMIN_DATABASE_URL%/*}"
SRC_URL="${SERVER_URL}/${SRC_DB}"
TGT_URL="${SERVER_URL}/${TGT_DB}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  "$PSQL_BIN" "$TEST_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SRC_DB\";" >/dev/null 2>&1 || true
  "$PSQL_BIN" "$TEST_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$TGT_DB\";" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log "creating source database $SRC_DB"
if ! "$PSQL_BIN" "$TEST_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SRC_DB\";"; then
  log "error: could not create $SRC_DB"
  exit 2
fi

log "seeding source database"
SEED_ROWS=37
if ! "$PSQL_BIN" "$SRC_URL" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE drill_rows (id serial PRIMARY KEY, note text);
  INSERT INTO drill_rows (note) SELECT 'row ' || g FROM generate_series(1, $SEED_ROWS) AS g;
"; then
  log "error: could not seed $SRC_DB"
  exit 2
fi

log "running pg-backup.sh against source database"
if ! DATABASE_URL="$SRC_URL" BACKUP_TARGET_DIR="$TMP_DIR" RETENTION_DAYS=7 \
    "$SCRIPT_DIR/pg-backup.sh"; then
  log "error: pg-backup.sh failed"
  exit 3
fi

DUMP_FILE="$(find "$TMP_DIR" -maxdepth 1 -name '*.dump' -print | sort | tail -n1)"
if [[ -z "$DUMP_FILE" ]]; then
  log "error: no dump file found in $TMP_DIR after pg-backup.sh"
  exit 3
fi

log "running pg-restore.sh into a fresh target database"
if ! "$SCRIPT_DIR/pg-restore.sh" "$DUMP_FILE" "$TGT_URL" --create; then
  log "error: pg-restore.sh failed"
  exit 4
fi

SRC_COUNT="$("$PSQL_BIN" "$SRC_URL" -t -A -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM drill_rows;")"
TGT_COUNT="$("$PSQL_BIN" "$TGT_URL" -t -A -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM drill_rows;")"

log "source rows: $SRC_COUNT, restored rows: $TGT_COUNT"
if [[ "$SRC_COUNT" != "$TGT_COUNT" || "$SRC_COUNT" != "$SEED_ROWS" ]]; then
  log "error: row counts did not match (expected $SEED_ROWS)"
  exit 5
fi

log "PASS: restore drill produced identical row counts"
