#!/usr/bin/env bash
# Restores a dump made by pg-backup.sh (audit finding D-01,
# docs/multitenancy/backup-spec.md section 5 — "a restore drill is the only
# thing that proves a backup"). Verifies the sha256 sidecar before touching
# any database, then runs pg_restore. Two modes, matching pg-backup.sh:
#
#   Direct mode (the local restore-test case):
#     deploy/backup/pg-restore.sh <dump-file> <target-database-url> [--create]
#
#     --create creates the target database first (connecting to the
#     "postgres" maintenance database on the same server) and then restores
#     into it. Without --create the target database must already exist and
#     be empty; pg_restore --clean --if-exists in this script is a no-op on
#     an empty database and a safety net on a reused one.
#
#   Docker exec mode (documented for the live mt host, never run against it
#   by this task — deploy/backup/RUNBOOK.md explains when an operator uses
#   this): set PG_RESTORE_DOCKER_CONTAINER, PG_RESTORE_DB_USER and
#   PG_RESTORE_DB_NAME, then:
#     deploy/backup/pg-restore.sh <dump-file>
#   This mode never creates a database; the target must already exist.
#
# Optional:
#   PG_RESTORE_BIN       path to pg_restore. Default "pg_restore".
#   PSQL_BIN             path to psql, used by --create and by the version
#                         check below. Default "psql".
#   SKIP_CHECKSUM_CHECK  set to "1" to restore a dump with no .sha256 sidecar
#                         (e.g. one produced by an older run). Default off.
#
# In direct mode, refuses to run when pg_restore's major version differs from
# the target server's (see version-guard.sh). Docker-exec mode skips this
# check: the client always matches the server there.
#
# Exit codes:
#   0  restored and pg_restore reported no error
#   1  usage or configuration error, or a client/server major version mismatch
#   2  the dump file's sha256 does not match its .sha256 sidecar
#   3  --create failed to create the target database
#   4  pg_restore failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./version-guard.sh
. "$SCRIPT_DIR/version-guard.sh"

log() { echo "[pg-restore] $*" >&2; }

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" ]]; then
  log "error: usage: $(basename "$0") <dump-file> [<target-database-url>] [--create]"
  exit 1
fi
if [[ ! -f "$DUMP_FILE" ]]; then
  log "error: $DUMP_FILE does not exist"
  exit 1
fi

PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PSQL_BIN="${PSQL_BIN:-psql}"

CHECKSUM_FILE="${DUMP_FILE}.sha256"
if [[ "${SKIP_CHECKSUM_CHECK:-}" != "1" ]]; then
  if [[ ! -f "$CHECKSUM_FILE" ]]; then
    log "error: $CHECKSUM_FILE not found (set SKIP_CHECKSUM_CHECK=1 to bypass)"
    exit 2
  fi
  log "verifying checksum against $CHECKSUM_FILE"
  if command -v sha256sum >/dev/null 2>&1; then
    if ! (cd "$(dirname "$DUMP_FILE")" && sha256sum -c "$(basename "$CHECKSUM_FILE")"); then
      log "error: checksum mismatch for $DUMP_FILE"
      exit 2
    fi
  elif command -v shasum >/dev/null 2>&1; then
    if ! (cd "$(dirname "$DUMP_FILE")" && shasum -a 256 -c "$(basename "$CHECKSUM_FILE")"); then
      log "error: checksum mismatch for $DUMP_FILE"
      exit 2
    fi
  else
    log "error: neither sha256sum nor shasum is on PATH"
    exit 2
  fi
fi

if [[ -n "${PG_RESTORE_DOCKER_CONTAINER:-}" ]]; then
  if [[ -z "${PG_RESTORE_DB_USER:-}" || -z "${PG_RESTORE_DB_NAME:-}" ]]; then
    log "error: PG_RESTORE_DOCKER_CONTAINER is set but PG_RESTORE_DB_USER or PG_RESTORE_DB_NAME is missing"
    exit 1
  fi
  log "restoring into $PG_RESTORE_DB_NAME on container $PG_RESTORE_DOCKER_CONTAINER"
  if ! docker exec -i "$PG_RESTORE_DOCKER_CONTAINER" "$PG_RESTORE_BIN" \
      --no-owner --no-privileges --clean --if-exists \
      -U "$PG_RESTORE_DB_USER" -d "$PG_RESTORE_DB_NAME" < "$DUMP_FILE"; then
    log "error: pg_restore failed"
    exit 4
  fi
  log "done"
  exit 0
fi

TARGET_URL="${2:-}"
if [[ -z "$TARGET_URL" ]]; then
  log "error: direct mode needs <target-database-url> as the second argument"
  exit 1
fi
CREATE=0
if [[ "${3:-}" == "--create" ]]; then
  CREATE=1
fi

DB_NAME="${TARGET_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
MAINTENANCE_URL="${TARGET_URL%/*}/postgres"
PROBE_URL="$TARGET_URL"
if [[ "$CREATE" -eq 1 ]]; then
  PROBE_URL="$MAINTENANCE_URL"
fi
if ! pg_backup_require_matching_version "$PG_RESTORE_BIN" "$PROBE_URL" "$PSQL_BIN"; then
  exit 1
fi

if [[ "$CREATE" -eq 1 ]]; then
  log "creating database $DB_NAME"
  if ! "$PSQL_BIN" "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";"; then
    log "error: could not create $DB_NAME"
    exit 3
  fi
fi

log "restoring into $TARGET_URL"
if ! "$PG_RESTORE_BIN" --no-owner --no-privileges --clean --if-exists -d "$TARGET_URL" "$DUMP_FILE"; then
  log "error: pg_restore failed"
  exit 4
fi
log "done"
