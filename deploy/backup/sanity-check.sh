#!/usr/bin/env bash
# Shared by nightly-run.sh: the "fails loudly" half of the nightly job. A
# dump or archive command can exit 0 and still be useless — the RUNBOOK's own
# pitfall is a `pg_dump -U postgres` against a database where the role is
# `medusa`: a legal, empty dump, zero error. pg-backup.sh's `pg_restore -l`
# check catches a dump pg_restore cannot read at all; this catches the
# quieter failure, a dump or archive that reads fine but is implausibly small
# or implausibly old.
#
# Usage: pg_backup_sanity_check <dir> <label> <ext> <min_bytes> <max_age_hours> <max_shrink_percent>
#   dir                 directory the files live in
#   label               filename prefix (matches rotate-backups.sh's <label>)
#   ext                 extension without the dot ("dump" or "tar.gz")
#   min_bytes           the newest file must be at least this many bytes
#   max_age_hours       the newest file must be no older than this many hours
#   max_shrink_percent  fail if the newest file is more than this percent
#                        smaller than the previous one of the same label
#                        (0 disables the shrink check)
#
# Prints a loud "error:"-prefixed line and returns 1 on any failing check, so
# a caller running under `set -euo pipefail` stops immediately. Returns 0,
# silently past its own log lines, when every check passes.
pg_backup_sanity_check() {
  local dir="$1" label="$2" ext="$3" min_bytes="$4" max_age_hours="$5" max_shrink_percent="$6"
  local f
  local -a files=()

  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(find "$dir" -maxdepth 1 -name "${label}-*.${ext}" -print 2>/dev/null | sort -r)

  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "[sanity-check] error: no $label-*.$ext file found in $dir" >&2
    return 1
  fi

  local newest="${files[0]}"
  local size
  size="$(wc -c <"$newest" | tr -d ' ')"
  if [[ "$size" -lt "$min_bytes" ]]; then
    echo "[sanity-check] error: $newest is $size bytes, below the $min_bytes byte floor" \
      "(a dump or archive this small usually means the wrong source was read, not real data)" >&2
    return 1
  fi

  local mtime now age_hours
  mtime="$(_pg_backup_file_mtime_epoch "$newest")"
  now="$(date +%s)"
  age_hours=$(((now - mtime) / 3600))
  if [[ "$age_hours" -gt "$max_age_hours" ]]; then
    echo "[sanity-check] error: $newest is $age_hours hour(s) old, older than the $max_age_hours hour ceiling" \
      "(the job that should have produced tonight's file did not run or did not finish)" >&2
    return 1
  fi

  if [[ "$max_shrink_percent" -gt 0 && "${#files[@]}" -ge 2 ]]; then
    local previous prev_size threshold
    previous="${files[1]}"
    prev_size="$(wc -c <"$previous" | tr -d ' ')"
    threshold=$((prev_size * (100 - max_shrink_percent) / 100))
    if [[ "$size" -lt "$threshold" ]]; then
      echo "[sanity-check] error: $newest ($size bytes) is more than $max_shrink_percent% smaller than" \
        "$previous ($prev_size bytes) — looks like a truncated or wrong-source backup" >&2
      return 1
    fi
  fi

  echo "[sanity-check] $label: $newest ok (size=$size bytes, age=${age_hours}h)" >&2
}

# GNU `stat` (the Linux hosts this runs on) takes `-c %Y`; BSD `stat` (macOS)
# takes `-f %m`. Neither flag can simply be "tried first" by exit status: on
# GNU, `-f` means --file-system, so `stat -f %m <file>` prints a multi-line
# "File: … ID: … Type: …" block to stdout (exit 1, because "%m" is not a
# mount point) and the caller's arithmetic then dies with
# "File: unbound variable" (seen on the RU host, 2026-10-03). On BSD, `-c`
# can print the literal "%Y". So each form's output is accepted only when it
# is a bare epoch number.
_pg_backup_file_mtime_epoch() {
  local f="$1" out
  if out="$(stat -c %Y "$f" 2>/dev/null)" && [[ "$out" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  if out="$(stat -f %m "$f" 2>/dev/null)" && [[ "$out" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  echo "[sanity-check] error: cannot read the mtime of $f with GNU or BSD stat" >&2
  return 1
}
