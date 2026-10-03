#!/usr/bin/env bash
# Shared by nightly-run.sh: a grandfather-father-son style rotation over one
# label's backup files (pg-backup.sh's dumps or media-backup.sh's archives),
# so a host keeps more history than a flat N-day window without keeping every
# single nightly file forever.
#
# Count-based, not calendar-based, on purpose: the alternative (bucket by ISO
# week) needs a date parser, and BSD `date` (macOS, where this is tested per
# rule 5zb) and GNU `date` (the Linux hosts this actually runs on) take
# different flags for the same conversion. Filenames already sort
# chronologically (pg-backup.sh / media-backup.sh both write
# "<label>-YYYYMMDD-HHMMSS.<ext>"), so this rotates by POSITION in that
# sorted list instead: the newest `daily_count` files are always kept, then
# every 7th file after that is kept as a "weekly" slot, up to `weekly_count`
# of them. This is exact when the caller runs once a day (the only schedule
# this task installs) and degrades gracefully otherwise: "daily"/"weekly"
# here mean "the last N runs" and "one of every 7 runs after that", not a
# calendar day or an ISO week.
#
# Usage: pg_backup_rotate_gfs <dir> <label> <ext> <daily_count> <weekly_count>
#   dir           directory the files live in (pg-backup.sh's BACKUP_TARGET_DIR)
#   label         filename prefix before the first "-" of the timestamp
#   ext           extension after the timestamp, without the dot ("dump" or
#                 "tar.gz") — matched literally, not as a glob
#   daily_count   how many of the newest files to always keep
#   weekly_count  how many additional, evenly-spaced older files to keep
#
# Never fails the caller: a delete that cannot run (permissions, a file
# removed between listing and deleting) is logged and skipped, because by the
# time rotation runs the night's backup has already been produced and
# verified — losing it to a rotation bug would be worse than leaving one
# extra old file on disk. The caller decides whether to treat that as fatal.
pg_backup_rotate_gfs() {
  local dir="$1" label="$2" ext="$3" daily_count="$4" weekly_count="$5"
  local f
  local -a files=()

  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(find "$dir" -maxdepth 1 -name "${label}-*.${ext}" -print 2>/dev/null | sort -r)

  local total=${#files[@]}
  echo "[rotate-backups] $label: $total file(s) on disk, keeping $daily_count daily + up to $weekly_count weekly" >&2

  local i kept_weekly=0 rel
  for ((i = 0; i < total; i++)); do
    if ((i < daily_count)); then
      continue
    fi
    rel=$((i - daily_count))
    if ((rel % 7 == 0 && kept_weekly < weekly_count)); then
      kept_weekly=$((kept_weekly + 1))
      continue
    fi
    echo "[rotate-backups] $label: removing ${files[$i]}" >&2
    rm -f -- "${files[$i]}" "${files[$i]}.sha256" || echo "[rotate-backups] warning: could not remove ${files[$i]}" >&2
  done
}
