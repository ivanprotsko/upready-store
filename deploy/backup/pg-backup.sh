#!/usr/bin/env bash
# Nightly Postgres backup for one instance (audit finding D-01,
# docs/multitenancy/backup-spec.md section 1, tier 1 of rule 42a). Dumps in
# pg_dump's custom format (`-Fc`), writes a sha256 sidecar next to the dump,
# verifies the archive with `pg_restore -l` before declaring success, and
# prunes dumps older than the retention window. This script never touches a
# live host by itself: install it as a cron job or systemd timer per
# deploy/backup/RUNBOOK.md, it does not do that for you.
#
# Usage:
#   deploy/backup/pg-backup.sh
#
# Required environment:
#   BACKUP_TARGET_DIR   directory dumps and checksums land in, created if
#                        missing. This is tier 1 (`<project>/backups/`, 7 days
#                        by rule 42a) or wherever the caller points it; this
#                        script only reads the path, it does not know which
#                        tier it is.
# One of these two connection modes:
#   DATABASE_URL              a postgres:// URL pg_dump can connect with
#                              directly (the local stand case, and any host
#                              where Postgres is reachable from the caller).
#   PG_DUMP_DOCKER_CONTAINER  a running container name/id to `docker exec`
#                              pg_dump into instead (the live mt host case:
#                              deploy/compose.mt.yml keeps postgres off any
#                              published port, only reachable inside the
#                              `coolify` network — see RUNBOOK.md). When set,
#                              also set PG_DUMP_DB_USER and PG_DUMP_DB_NAME
#                              (the role in mt-postgres is `medusa`, never
#                              `postgres` — memory upready-store-mt-deploy-
#                              shipshift-2026-09-11.md, pitfall 1).
# Optional:
#   RETENTION_DAYS   dumps (and sidecars) older than this many days are
#                     deleted after a successful backup. Default 7.
#   BACKUP_LABEL     filename prefix. Default "medusa".
#   PG_DUMP_BIN      path to pg_dump. Default "pg_dump" (resolved on PATH).
#   PG_RESTORE_BIN   path to pg_restore, used only for the `-l` sanity check
#                     against the archive just written. Default "pg_restore".
#   PSQL_BIN         path to psql, used only for the client/server version
#                     check below (DATABASE_URL mode only). Default "psql".
#
# In DATABASE_URL mode, refuses to run when pg_dump's major version differs
# from the server's (see version-guard.sh: a newer pg_dump can embed GUCs an
# older server's own pg_restore/server does not know, breaking restore later
# even though the dump itself "succeeds"). Docker-exec mode skips this check:
# the client always matches the server there.
#
# Exit codes:
#   0  backup written, verified, retention applied
#   1  usage or configuration error (missing env, bad combination, or a
#      client/server major version mismatch)
#   2  the dump command itself failed
#   3  the dump file is missing or empty after a reported success
#   4  pg_restore -l could not read the archive, or it listed zero objects
#   5  could not write the checksum sidecar
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./version-guard.sh
. "$SCRIPT_DIR/version-guard.sh"

log() { echo "[pg-backup] $*" >&2; }

if [[ -z "${BACKUP_TARGET_DIR:-}" ]]; then
  log "error: BACKUP_TARGET_DIR is not set"
  exit 1
fi

PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PSQL_BIN="${PSQL_BIN:-psql}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_LABEL="${BACKUP_LABEL:-medusa}"

if [[ -n "${PG_DUMP_DOCKER_CONTAINER:-}" ]]; then
  if [[ -z "${PG_DUMP_DB_USER:-}" || -z "${PG_DUMP_DB_NAME:-}" ]]; then
    log "error: PG_DUMP_DOCKER_CONTAINER is set but PG_DUMP_DB_USER or PG_DUMP_DB_NAME is missing"
    exit 1
  fi
  DUMP_CMD=(docker exec "$PG_DUMP_DOCKER_CONTAINER" "$PG_DUMP_BIN" -U "$PG_DUMP_DB_USER" -Fc "$PG_DUMP_DB_NAME")
elif [[ -n "${DATABASE_URL:-}" ]]; then
  if ! pg_backup_require_matching_version "$PG_DUMP_BIN" "$DATABASE_URL" "$PSQL_BIN"; then
    exit 1
  fi
  DUMP_CMD=("$PG_DUMP_BIN" -Fc "$DATABASE_URL")
else
  log "error: set either DATABASE_URL or PG_DUMP_DOCKER_CONTAINER (+ PG_DUMP_DB_USER, PG_DUMP_DB_NAME)"
  exit 1
fi

mkdir -p "$BACKUP_TARGET_DIR"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_TARGET_DIR/${BACKUP_LABEL}-${TIMESTAMP}.dump"
CHECKSUM_FILE="${DUMP_FILE}.sha256"

log "dumping to $DUMP_FILE"
DUMP_STATUS=0
"${DUMP_CMD[@]}" > "$DUMP_FILE" || DUMP_STATUS=$?
if [[ "$DUMP_STATUS" -ne 0 ]]; then
  log "error: pg_dump failed (exit $DUMP_STATUS)"
  rm -f "$DUMP_FILE"
  exit 2
fi

if [[ ! -s "$DUMP_FILE" ]]; then
  log "error: $DUMP_FILE is missing or empty after a reported success"
  rm -f "$DUMP_FILE"
  exit 3
fi

log "verifying archive with $PG_RESTORE_BIN -l"
OBJECT_COUNT="$("$PG_RESTORE_BIN" -l "$DUMP_FILE" 2>/dev/null | grep -c ';' || true)"
if [[ -z "$OBJECT_COUNT" || "$OBJECT_COUNT" -eq 0 ]]; then
  log "error: pg_restore -l could not read $DUMP_FILE, or it listed zero objects"
  exit 4
fi
log "archive lists $OBJECT_COUNT objects"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_TARGET_DIR" && sha256sum "$(basename "$DUMP_FILE")") > "$CHECKSUM_FILE"
elif command -v shasum >/dev/null 2>&1; then
  (cd "$BACKUP_TARGET_DIR" && shasum -a 256 "$(basename "$DUMP_FILE")") > "$CHECKSUM_FILE"
else
  log "error: neither sha256sum nor shasum is on PATH"
  exit 5
fi
if [[ ! -s "$CHECKSUM_FILE" ]]; then
  log "error: failed to write $CHECKSUM_FILE"
  exit 5
fi
log "checksum written to $CHECKSUM_FILE"

log "applying retention: deleting dumps older than $RETENTION_DAYS days"
find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${BACKUP_LABEL}-*.dump" -mtime "+${RETENTION_DAYS}" -print -delete || true
find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${BACKUP_LABEL}-*.dump.sha256" -mtime "+${RETENTION_DAYS}" -print -delete || true

DUMP_SIZE="$(wc -c < "$DUMP_FILE" | tr -d ' ')"
log "done: $DUMP_FILE ($DUMP_SIZE bytes, $OBJECT_COUNT objects)"
