#!/usr/bin/env bash
# Generates the wrapper script and the systemd timer (preferred) or cron
# line that runs nightly-run.sh — and, with --with-cross-copy, cross-copy.sh
# right after it — on a host (t-cherk-36). This script only WRITES files and
# prints what it is about to do; it never runs itself as part of this task.
# Installing it against a live host is t-cherk-16, the lead's job, with
# Ivan's separate go-ahead — the same rule every other change to a live host
# in this repository follows (see RUNBOOK.md's own header note).
#
# Usage:
#   deploy/backup/install.sh --project-dir <dir> --env-file <file> [options]
#
# Required flags:
#   --project-dir <dir>   where this repository's deploy/backup/ lives on the
#                         host, e.g. /opt/upready-store/mt. The wrapper cd's
#                         here before running nightly-run.sh.
#   --env-file <file>     a shell-sourceable file on the host carrying every
#                         env var nightly-run.sh (and cross-copy.sh, with
#                         --with-cross-copy) needs — BACKUP_TARGET_DIR,
#                         PG_DUMP_DOCKER_CONTAINER, MEDIA_SOURCE_DIRS, and so
#                         on. See nightly.env.example for the full list with
#                         comments. Never copied or printed by this script;
#                         only its path is written into the generated units.
#
# Options:
#   --with-cross-copy          chain cross-copy.sh after a successful
#                              nightly-run.sh in the generated wrapper.
#   --schedule <value>         systemd OnCalendar expression (mode systemd)
#                              or a 5-field cron expression (mode cron).
#                              Default "*-*-* 03:00:00" / "0 3 * * *".
#   --mode systemd|cron        force one mode instead of auto-detecting
#                              `systemctl` on PATH.
#   --name <value>              unit/cron job name. Default "mt-backup".
#   --install-drill-timer <value>   also install a second timer/cron job
#                              running restore-drill.sh on this schedule
#                              (an OnCalendar or cron expression, same rules
#                              as --schedule). Not installed by default: a
#                              full restore of real data is heavier than the
#                              nightly dump+archive, so RUNBOOK.md's default
#                              recommendation is monthly, run by an operator
#                              who reads the output, not an unattended
#                              timer — this flag is for a host that wants it
#                              unattended anyway.
#   --dry-run                  print every file this run would write and
#                              every command it would run, and write or run
#                              NOTHING. This is the only mode this task
#                              itself exercises against a real environment —
#                              see RUNBOOK.md for why.
#
# Environment overrides, mainly for testing this script itself without
# touching a real systemd or crontab:
#   UNIT_DIR        where systemd unit files are written. Default
#                   "/etc/systemd/system".
#   SYSTEMCTL_BIN   the systemctl binary to run. Default "systemctl".
#   CRONTAB_BIN     the crontab binary to run. Default "crontab".
#
# Exit codes:
#   0  done (or, with --dry-run, printed what would be done)
#   1  usage or configuration error
#   2  writing a generated file failed
#   3  the systemctl or crontab step failed
set -euo pipefail

log() { echo "[install] $*" >&2; }

PROJECT_DIR=""
ENV_FILE=""
WITH_CROSS_COPY=0
SCHEDULE=""
MODE=""
NAME="mt-backup"
DRILL_SCHEDULE=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
  --project-dir)
    PROJECT_DIR="${2:-}"
    shift 2
    ;;
  --env-file)
    ENV_FILE="${2:-}"
    shift 2
    ;;
  --with-cross-copy)
    WITH_CROSS_COPY=1
    shift
    ;;
  --schedule)
    SCHEDULE="${2:-}"
    shift 2
    ;;
  --mode)
    MODE="${2:-}"
    shift 2
    ;;
  --name)
    NAME="${2:-}"
    shift 2
    ;;
  --install-drill-timer)
    DRILL_SCHEDULE="${2:-}"
    shift 2
    ;;
  --dry-run)
    DRY_RUN=1
    shift
    ;;
  *)
    log "error: unknown argument $1"
    exit 1
    ;;
  esac
done

if [[ -z "$PROJECT_DIR" || -z "$ENV_FILE" ]]; then
  log "error: --project-dir and --env-file are required"
  exit 1
fi

if [[ -z "$MODE" ]]; then
  if command -v "${SYSTEMCTL_BIN:-systemctl}" >/dev/null 2>&1; then
    MODE="systemd"
  else
    MODE="cron"
  fi
fi
if [[ "$MODE" != "systemd" && "$MODE" != "cron" ]]; then
  log "error: --mode must be systemd or cron, got: $MODE"
  exit 1
fi

if [[ -z "$SCHEDULE" ]]; then
  if [[ "$MODE" == "systemd" ]]; then
    SCHEDULE="*-*-* 03:00:00"
  else
    SCHEDULE="0 3 * * *"
  fi
fi

UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
CRONTAB_BIN="${CRONTAB_BIN:-crontab}"
GENERATED_DIR="$PROJECT_DIR/deploy/backup/.generated"

# Writes $2 to path $1, or just prints both in --dry-run.
write_file() {
  local path="$1" content="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "--dry-run: would write $path:"
    echo "--- $path ---"
    echo "$content"
    echo "--- end $path ---"
    return 0
  fi
  mkdir -p "$(dirname "$path")" || {
    log "error: could not create $(dirname "$path")"
    exit 2
  }
  echo "$content" >"$path" || {
    log "error: could not write $path"
    exit 2
  }
  log "wrote $path"
}

# Builds one wrapper that sources the env file, cd's into the project and
# runs the given script(s); used for both the nightly job and (with
# --install-drill-timer) the drill job, and for both systemd and cron, so
# the unit/cron line itself never has to know about env vars at all.
build_wrapper() {
  local wrapper_path="$1"
  shift
  local scripts=("$@")
  local body="#!/usr/bin/env bash
set -euo pipefail
set -a
# shellcheck disable=SC1090
. \"$ENV_FILE\"
set +a
cd \"$PROJECT_DIR\""
  local i last=$((${#scripts[@]} - 1))
  for ((i = 0; i <= last; i++)); do
    body="$body
\"$PROJECT_DIR/deploy/backup/${scripts[$i]}\""
    if [[ "$i" -lt "$last" ]]; then
      body="$body &&"
    fi
  done
  write_file "$wrapper_path" "$body"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    chmod +x "$wrapper_path"
  fi
}

install_systemd_unit() {
  local unit_name="$1" description="$2" wrapper_path="$3" schedule="$4"
  local service_file="$UNIT_DIR/${unit_name}.service"
  local timer_file="$UNIT_DIR/${unit_name}.timer"

  write_file "$service_file" "[Unit]
Description=$description

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_DIR
ExecStart=$wrapper_path"

  write_file "$timer_file" "[Unit]
Description=Run $unit_name on a schedule

[Timer]
OnCalendar=$schedule
Persistent=true

[Install]
WantedBy=timers.target"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "--dry-run: would run: $SYSTEMCTL_BIN daemon-reload"
    log "--dry-run: would run: $SYSTEMCTL_BIN enable --now ${unit_name}.timer"
    return 0
  fi
  if ! "$SYSTEMCTL_BIN" daemon-reload; then
    log "error: $SYSTEMCTL_BIN daemon-reload failed"
    exit 3
  fi
  if ! "$SYSTEMCTL_BIN" enable --now "${unit_name}.timer"; then
    log "error: $SYSTEMCTL_BIN enable --now ${unit_name}.timer failed"
    exit 3
  fi
  log "enabled ${unit_name}.timer"
}

install_cron_job() {
  local unit_name="$1" wrapper_path="$2" schedule="$3"
  local marker="# upready-store $unit_name (deploy/backup/install.sh)"
  local log_file="$PROJECT_DIR/deploy/backup/${unit_name}.log"
  local line="$schedule $wrapper_path >> $log_file 2>&1 $marker"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "--dry-run: would install this crontab line (replacing any existing one with the same marker):"
    echo "$line"
    return 0
  fi
  local existing
  existing="$("$CRONTAB_BIN" -l 2>/dev/null || true)"
  { echo "$existing" | grep -v -F "$marker" || true
    echo "$line"; } | "$CRONTAB_BIN" - || {
    log "error: $CRONTAB_BIN failed to install the new crontab"
    exit 3
  }
  log "installed crontab line for $unit_name"
}

NIGHTLY_SCRIPTS=("nightly-run.sh")
if [[ "$WITH_CROSS_COPY" -eq 1 ]]; then
  NIGHTLY_SCRIPTS+=("cross-copy.sh")
fi

NIGHTLY_WRAPPER="$GENERATED_DIR/run-${NAME}.sh"
build_wrapper "$NIGHTLY_WRAPPER" "${NIGHTLY_SCRIPTS[@]}"

if [[ "$MODE" == "systemd" ]]; then
  install_systemd_unit "$NAME" "Nightly backup for $NAME (t-cherk-36)" "$NIGHTLY_WRAPPER" "$SCHEDULE"
else
  install_cron_job "$NAME" "$NIGHTLY_WRAPPER" "$SCHEDULE"
fi

if [[ -n "$DRILL_SCHEDULE" ]]; then
  DRILL_WRAPPER="$GENERATED_DIR/run-${NAME}-drill.sh"
  build_wrapper "$DRILL_WRAPPER" "restore-drill.sh"
  if [[ "$MODE" == "systemd" ]]; then
    install_systemd_unit "${NAME}-drill" "Restore drill for $NAME (t-cherk-36)" "$DRILL_WRAPPER" "$DRILL_SCHEDULE"
  else
    install_cron_job "${NAME}-drill" "$DRILL_WRAPPER" "$DRILL_SCHEDULE"
  fi
fi

log "done (mode=$MODE, dry-run=$DRY_RUN)"
