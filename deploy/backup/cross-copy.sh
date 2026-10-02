#!/usr/bin/env bash
# Pushes this host's newest dump and media archive (plus their sha256
# sidecars) to the OTHER host, so each of the two hosts (contabo + the
# Russian server, t-cherk-36) holds a copy of the other's latest backup and
# losing one host does not lose both copies. Meant to run after
# nightly-run.sh succeeds — install.sh's generated wrapper chains the two
# with `&&` so a backup that failed its own sanity check is never copied
# anywhere. Safe to re-run: rsync only transfers what changed, and nothing
# here deletes on the remote except this script's own retention pass, which
# only ever removes files it recognizes as past their own window.
#
# Usage:
#   deploy/backup/cross-copy.sh
#
# Required environment:
#   BACKUP_TARGET_DIR      local directory nightly-run.sh wrote into (same
#                           meaning as in pg-backup.sh / media-backup.sh)
#   CROSS_COPY_SSH_HOST     the other host's address (hostname or IP)
#
# Optional:
#   CROSS_COPY_SSH_USER     default "root" (matches every other deploy
#                           script's SSH convention in this repository)
#   CROSS_COPY_SSH_KEY      path to the private key; falls back to ssh/rsync's
#                           own default identity resolution when unset
#   CROSS_COPY_REMOTE_DIR   directory on the other host to copy into.
#                           Default "/opt/upready-store/backups/cross-copy"
#   DB_BACKUP_LABEL         filename prefix to find locally and look for
#                           remotely. Default "medusa" (pg-backup.sh's own
#                           default; set to nightly-run.sh's DB_BACKUP_LABEL
#                           when that was overridden)
#   MEDIA_BACKUP_LABEL      filename prefix for the media archive. Default
#                           "media"
#   REMOTE_RETENTION_DAYS   delete copies on the OTHER host older than this
#                           many days, applied after a successful copy.
#                           Default 14 — generous slack over the two hosts'
#                           own nightly cadence, since this is a second copy
#                           of data the source host still has, not the only
#                           copy.
#   S3_ENABLED              set to "1" to also push to an S3-compatible
#                           bucket (Timeweb Cloud / Selectel S3). Off by
#                           default. Needs the `aws` CLI on PATH and
#                           AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY set the
#                           usual way (this script never reads or echoes
#                           them itself).
#   S3_ENDPOINT_URL         required when S3_ENABLED=1, e.g.
#                           https://s3.twcstorage.ru for Timeweb Cloud.
#   S3_BUCKET               required when S3_ENABLED=1.
#   S3_PREFIX               key prefix inside the bucket. Default "mt".
#
# Exit codes:
#   0  the newest dump (and media archive, if present) reached the other
#      host, and the S3 push (if enabled) succeeded
#   1  usage or configuration error
#   2  no dump file found locally for DB_BACKUP_LABEL (the one artifact this
#      script treats as mandatory — a missing media archive is only logged)
#   3  rsync to the other host failed
#   4  S3_ENABLED=1 but the push to S3 failed, or the `aws` CLI is missing
#
# Remote retention failing is logged as a warning, not fatal: the transfer
# itself already succeeded by the time retention runs, and losing that
# success to an unrelated prune error on the other host would be worse than
# leaving one extra old file there until the next run.
set -euo pipefail

log() { echo "[cross-copy] $*" >&2; }

if [[ -z "${BACKUP_TARGET_DIR:-}" ]]; then
  log "error: BACKUP_TARGET_DIR is not set"
  exit 1
fi
if [[ -z "${CROSS_COPY_SSH_HOST:-}" ]]; then
  log "error: CROSS_COPY_SSH_HOST is not set"
  exit 1
fi

CROSS_COPY_SSH_USER="${CROSS_COPY_SSH_USER:-root}"
CROSS_COPY_REMOTE_DIR="${CROSS_COPY_REMOTE_DIR:-/opt/upready-store/backups/cross-copy}"
DB_BACKUP_LABEL="${DB_BACKUP_LABEL:-medusa}"
MEDIA_BACKUP_LABEL="${MEDIA_BACKUP_LABEL:-media}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-14}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${CROSS_COPY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$CROSS_COPY_SSH_KEY")
fi
REMOTE="${CROSS_COPY_SSH_USER}@${CROSS_COPY_SSH_HOST}"

DUMP_FILE="$(find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${DB_BACKUP_LABEL}-*.dump" -print 2>/dev/null | sort -r | head -n1)"
if [[ -z "$DUMP_FILE" ]]; then
  log "error: no ${DB_BACKUP_LABEL}-*.dump file found under $BACKUP_TARGET_DIR"
  exit 2
fi
MEDIA_FILE="$(find "$BACKUP_TARGET_DIR" -maxdepth 1 -name "${MEDIA_BACKUP_LABEL}-*.tar.gz" -print 2>/dev/null | sort -r | head -n1)"
if [[ -z "$MEDIA_FILE" ]]; then
  log "warning: no ${MEDIA_BACKUP_LABEL}-*.tar.gz file found under $BACKUP_TARGET_DIR — copying the dump only"
fi

TRANSFER_FILES=("$DUMP_FILE" "${DUMP_FILE}.sha256")
if [[ -n "$MEDIA_FILE" ]]; then
  TRANSFER_FILES+=("$MEDIA_FILE" "${MEDIA_FILE}.sha256")
fi

log "ensuring $CROSS_COPY_REMOTE_DIR exists on $CROSS_COPY_SSH_HOST"
# shellcheck disable=SC2029
if ! ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$CROSS_COPY_REMOTE_DIR'"; then
  log "error: could not create $CROSS_COPY_REMOTE_DIR on $CROSS_COPY_SSH_HOST"
  exit 3
fi

log "rsync ${TRANSFER_FILES[*]} -> ${REMOTE}:${CROSS_COPY_REMOTE_DIR}/"
if ! rsync -az -e "ssh ${SSH_OPTS[*]}" "${TRANSFER_FILES[@]}" "${REMOTE}:${CROSS_COPY_REMOTE_DIR}/"; then
  log "error: rsync to $CROSS_COPY_SSH_HOST failed"
  exit 3
fi

log "applying remote retention: deleting copies older than $REMOTE_RETENTION_DAYS days"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "$REMOTE" "find '$CROSS_COPY_REMOTE_DIR' -maxdepth 1 \\( -name '${DB_BACKUP_LABEL}-*.dump*' -o -name '${MEDIA_BACKUP_LABEL}-*.tar.gz*' \\) -mtime +${REMOTE_RETENTION_DAYS} -print -delete" \
  || log "warning: remote retention pass on $CROSS_COPY_SSH_HOST did not complete cleanly (the copy above still succeeded)"

if [[ "${S3_ENABLED:-}" == "1" ]]; then
  if [[ -z "${S3_ENDPOINT_URL:-}" || -z "${S3_BUCKET:-}" ]]; then
    log "error: S3_ENABLED=1 needs S3_ENDPOINT_URL and S3_BUCKET set"
    exit 4
  fi
  if ! command -v aws >/dev/null 2>&1; then
    log "error: S3_ENABLED=1 but the aws CLI is not on PATH"
    exit 4
  fi
  S3_PREFIX="${S3_PREFIX:-mt}"
  for f in "${TRANSFER_FILES[@]}"; do
    log "pushing $f -> s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$f")"
    if ! aws --endpoint-url "$S3_ENDPOINT_URL" s3 cp "$f" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$f")"; then
      log "error: upload of $f to S3 failed"
      exit 4
    fi
  done
fi

log "done: ${#TRANSFER_FILES[@]} file(s) reached $CROSS_COPY_SSH_HOST"
