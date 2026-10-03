#!/usr/bin/env bash
# The one entrypoint deploy/backup/install.sh points a systemd timer or cron
# job at (t-cherk-36). On one host, for one stack: dump the database
# (pg-backup.sh), archive its media (media-backup.sh), sanity-check each
# fresh artifact (sanity-check.sh), then rotate both pools with a
# grandfather-father-son retention (rotate-backups.sh) instead of either
# script's own flat N-day prune. Cross-host copy is a separate concern —
# cross-copy.sh, chained after this script by install.sh's generated wrapper
# only on success, so a bad local backup is never pushed to the other host.
#
# Usage:
#   deploy/backup/nightly-run.sh
#
# Required environment — passed straight through to pg-backup.sh (DB) and
# media-backup.sh (files), see their own header comments for the full
# reference:
#   BACKUP_TARGET_DIR          where both the dump and the media archive land
#   One of DATABASE_URL or (PG_DUMP_DOCKER_CONTAINER + PG_DUMP_DB_USER +
#     PG_DUMP_DB_NAME) — pg-backup.sh's two connection modes
#   MEDIA_SOURCE_DIRS          colon-separated directories media-backup.sh
#     archives
#
# Optional:
#   DB_BACKUP_LABEL        filename prefix for dumps. Default "medusa"
#                           (pg-backup.sh's own default BACKUP_LABEL).
#   MEDIA_BACKUP_LABEL      filename prefix for media archives. Default
#                           "media".
#   DAILY_RETENTION_COUNT   how many of the newest runs to always keep, for
#                           both pools. Default 7.
#   WEEKLY_RETENTION_COUNT  how many additional, evenly-spaced older runs to
#                           keep, for both pools. Default 4. See
#                           rotate-backups.sh for exactly what "daily" and
#                           "weekly" mean here (runs, not calendar time).
#   MIN_DUMP_SIZE_BYTES     sanity floor for the dump. Default 1024 — a
#                           conservative floor against a dump that is
#                           plainly wrong (RUNBOOK.md's `pg_dump -U postgres`
#                           pitfall), not an estimate of real data size.
#   MIN_MEDIA_SIZE_BYTES    sanity floor for the media archive. Default 1024.
#   MAX_BACKUP_AGE_HOURS    sanity ceiling on how old the artifact this run
#                           just produced is allowed to be. Default 26 (one
#                           day plus slack for a slow run).
#   MAX_SHRINK_PERCENT      sanity ceiling on how much smaller than the
#                           previous run's artifact this run's is allowed to
#                           be, as a percent. Default 50. Set 0 to disable.
#
# pg-backup.sh's and media-backup.sh's own RETENTION_DAYS env var is
# deliberately NOT read from the caller's environment here — this script
# sets it itself, generously (DAILY_RETENTION_COUNT + WEEKLY_RETENTION_COUNT
# * 7 + 7 days of slack), so that prune never removes a file the GFS rotation
# below still wants, and the GFS rotation stays the one source of truth for
# what survives long-term.
#
# Exit codes:
#   0  both artifacts backed up, sanity-checked and rotated
#   1  usage or configuration error
#   2  pg-backup.sh (the database dump) failed
#   3  the fresh dump failed its sanity check
#   4  media-backup.sh (the media archive) failed
#   5  the fresh media archive failed its sanity check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./sanity-check.sh
. "$SCRIPT_DIR/sanity-check.sh"
# shellcheck source=./rotate-backups.sh
. "$SCRIPT_DIR/rotate-backups.sh"

log() { echo "[nightly-run] $*" >&2; }

if [[ -z "${BACKUP_TARGET_DIR:-}" ]]; then
  log "error: BACKUP_TARGET_DIR is not set"
  exit 1
fi
if [[ -z "${MEDIA_SOURCE_DIRS:-}" ]]; then
  log "error: MEDIA_SOURCE_DIRS is not set (see media-backup.sh)"
  exit 1
fi

DB_BACKUP_LABEL="${DB_BACKUP_LABEL:-medusa}"
MEDIA_BACKUP_LABEL="${MEDIA_BACKUP_LABEL:-media}"
DAILY_RETENTION_COUNT="${DAILY_RETENTION_COUNT:-7}"
WEEKLY_RETENTION_COUNT="${WEEKLY_RETENTION_COUNT:-4}"
MIN_DUMP_SIZE_BYTES="${MIN_DUMP_SIZE_BYTES:-1024}"
MIN_MEDIA_SIZE_BYTES="${MIN_MEDIA_SIZE_BYTES:-1024}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"
MAX_SHRINK_PERCENT="${MAX_SHRINK_PERCENT:-50}"

SAFETY_NET_RETENTION_DAYS=$((DAILY_RETENTION_COUNT + WEEKLY_RETENTION_COUNT * 7 + 7))

log "step 1/4: database dump (label=$DB_BACKUP_LABEL)"
if ! BACKUP_LABEL="$DB_BACKUP_LABEL" RETENTION_DAYS="$SAFETY_NET_RETENTION_DAYS" \
    "$SCRIPT_DIR/pg-backup.sh"; then
  log "error: pg-backup.sh failed"
  exit 2
fi

log "step 2/4: database dump sanity check"
if ! pg_backup_sanity_check "$BACKUP_TARGET_DIR" "$DB_BACKUP_LABEL" "dump" \
    "$MIN_DUMP_SIZE_BYTES" "$MAX_BACKUP_AGE_HOURS" "$MAX_SHRINK_PERCENT"; then
  log "error: fresh dump failed its sanity check — see sanity-check's own error above"
  exit 3
fi

log "step 3/4: media archive (label=$MEDIA_BACKUP_LABEL)"
if ! MEDIA_BACKUP_LABEL="$MEDIA_BACKUP_LABEL" RETENTION_DAYS="$SAFETY_NET_RETENTION_DAYS" \
    "$SCRIPT_DIR/media-backup.sh"; then
  log "error: media-backup.sh failed"
  exit 4
fi

log "step 4/4: media archive sanity check"
if ! pg_backup_sanity_check "$BACKUP_TARGET_DIR" "$MEDIA_BACKUP_LABEL" "tar.gz" \
    "$MIN_MEDIA_SIZE_BYTES" "$MAX_BACKUP_AGE_HOURS" "$MAX_SHRINK_PERCENT"; then
  log "error: fresh media archive failed its sanity check — see sanity-check's own error above"
  exit 5
fi

log "rotating both pools: $DAILY_RETENTION_COUNT daily + $WEEKLY_RETENTION_COUNT weekly"
pg_backup_rotate_gfs "$BACKUP_TARGET_DIR" "$DB_BACKUP_LABEL" "dump" "$DAILY_RETENTION_COUNT" "$WEEKLY_RETENTION_COUNT"
pg_backup_rotate_gfs "$BACKUP_TARGET_DIR" "$MEDIA_BACKUP_LABEL" "tar.gz" "$DAILY_RETENTION_COUNT" "$WEEKLY_RETENTION_COUNT"

log "done: dump and media backed up, sanity-checked and rotated"
