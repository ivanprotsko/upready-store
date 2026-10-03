#!/usr/bin/env bash
# Nightly media backup for one host (t-cherk-36, sibling of pg-backup.sh for
# the mt stack's uploaded files). Tars one or more host directories, writes a
# sha256 sidecar, verifies the archive's own table of contents is non-empty
# before declaring success, then prunes archives older than the retention
# window. Like pg-backup.sh, this never touches a live host by itself — it
# only reads the directories it is pointed at and writes into
# BACKUP_TARGET_DIR; installing it as a timer or cron job is
# deploy/backup/install.sh's job, run by an operator with the lead's go-ahead.
#
# The mt stack's own media lives in two host directories (deploy/compose.mt.yml
# bind mounts): MEDIA_HOST_PATH (store-profile demo catalogs, mostly static
# once deployed) and TENANT_MEDIA_HOST_PATH (tenant uploads, written at
# runtime and the only one of the two that cannot be regenerated from the
# repository). Point MEDIA_SOURCE_DIRS at whichever of these — or any other
# directory — this host actually needs backed up.
#
# Usage:
#   deploy/backup/media-backup.sh
#
# Required environment:
#   BACKUP_TARGET_DIR   directory the archive and its checksum land in,
#                        created if missing.
#   MEDIA_SOURCE_DIRS    colon-separated list of directories to archive, e.g.
#                        "/opt/upready-store/media-tenants" or
#                        "/opt/upready-store/media-tenants:/opt/upready-store/media".
#                        Each is stored under its own basename inside the
#                        archive, so two source directories that happen to
#                        share a basename collide — name them distinctly.
# Optional:
#   RETENTION_DAYS       archives (and sidecars) older than this many days
#                         are deleted after a successful backup. Default 7.
#                         nightly-run.sh overrides this to a value generous
#                         enough that its own GFS rotation stays authoritative
#                         — see that script's header comment.
#   MEDIA_BACKUP_LABEL    filename prefix. Default "media". Kept distinct
#                         from pg-backup.sh's BACKUP_LABEL (default "medusa")
#                         so the two artifact types never collide in the same
#                         BACKUP_TARGET_DIR.
#   TAR_BIN               path to tar. Default "tar" (resolved on PATH).
#
# Exit codes:
#   0  archive written, verified, retention applied
#   1  usage or configuration error (missing env, or a source directory in
#      MEDIA_SOURCE_DIRS does not exist)
#   2  the tar command itself failed
#   3  the archive file is missing or empty after a reported success
#   4  `tar -tzf` could not read the archive, or it listed zero entries
#   5  could not write the checksum sidecar
set -euo pipefail

log() { echo "[media-backup] $*" >&2; }

if [[ -z "${BACKUP_TARGET_DIR:-}" ]]; then
  log "error: BACKUP_TARGET_DIR is not set"
  exit 1
fi
if [[ -z "${MEDIA_SOURCE_DIRS:-}" ]]; then
  log "error: MEDIA_SOURCE_DIRS is not set (colon-separated list of directories to archive)"
  exit 1
fi

TAR_BIN="${TAR_BIN:-tar}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
MEDIA_BACKUP_LABEL="${MEDIA_BACKUP_LABEL:-media}"

IFS=':' read -r -a SOURCE_DIRS <<<"$MEDIA_SOURCE_DIRS"
if [[ "${#SOURCE_DIRS[@]}" -eq 0 ]]; then
  log "error: MEDIA_SOURCE_DIRS did not contain any directory"
  exit 1
fi

TAR_ARGS=()
for dir in "${SOURCE_DIRS[@]}"; do
  if [[ ! -d "$dir" ]]; then
    log "error: source directory $dir does not exist"
    exit 1
  fi
  TAR_ARGS+=(-C "$(dirname "$dir")" "$(basename "$dir")")
done

mkdir -p "$BACKUP_TARGET_DIR"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVE_FILE="$BACKUP_TARGET_DIR/${MEDIA_BACKUP_LABEL}-${TIMESTAMP}.tar.gz"
CHECKSUM_FILE="${ARCHIVE_FILE}.sha256"

log "archiving ${SOURCE_DIRS[*]} to $ARCHIVE_FILE"
TAR_STATUS=0
"$TAR_BIN" -czf "$ARCHIVE_FILE" "${TAR_ARGS[@]}" || TAR_STATUS=$?
if [[ "$TAR_STATUS" -ne 0 ]]; then
  log "error: tar failed (exit $TAR_STATUS)"
  rm -f "$ARCHIVE_FILE"
  exit 2
fi

if [[ ! -s "$ARCHIVE_FILE" ]]; then
  log "error: $ARCHIVE_FILE is missing or empty after a reported success"
  rm -f "$ARCHIVE_FILE"
  exit 3
fi

log "verifying archive with $TAR_BIN -tzf"
ENTRY_COUNT="$("$TAR_BIN" -tzf "$ARCHIVE_FILE" 2>/dev/null | wc -l | tr -d ' ')"
if [[ -z "$ENTRY_COUNT" || "$ENTRY_COUNT" -eq 0 ]]; then
  log "error: tar -tzf could not read $ARCHIVE_FILE, or it listed zero entries"
  exit 4
fi
log "archive lists $ENTRY_COUNT entries"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_TARGET_DIR" && sha256sum "$(basename "$ARCHIVE_FILE")") >"$CHECKSUM_FILE"
elif command -v shasum >/dev/null 2>&1; then
  (cd "$BACKUP_TARGET_DIR" && shasum -a 256 "$(basename "$ARCHIVE_FILE")") >"$CHECKSUM_FILE"
else
  log "error: neither sha256sum nor shasum is on PATH"
  exit 5
fi
if [[ ! -s "$CHECKSUM_FILE" ]]; then
  log "error: failed to write $CHECKSUM_FILE"
  exit 5
fi
log "checksum written to $CHECKSUM_FILE"

log "applying retention: deleting archives older than $RETENTION_DAYS days"
find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${MEDIA_BACKUP_LABEL}-*.tar.gz" -mtime "+${RETENTION_DAYS}" -print -delete || true
find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${MEDIA_BACKUP_LABEL}-*.tar.gz.sha256" -mtime "+${RETENTION_DAYS}" -print -delete || true

ARCHIVE_SIZE="$(wc -c <"$ARCHIVE_FILE" | tr -d ' ')"
log "done: $ARCHIVE_FILE ($ARCHIVE_SIZE bytes, $ENTRY_COUNT entries)"
