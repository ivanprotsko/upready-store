#!/usr/bin/env bash
# deploy/auto/install.sh: puts the release agent (deploy/auto/release-agent.sh) on ONE production host and
# starts its timer (t-2026-10-12-30). Runs ON the host, as root, from a release tree already there:
#
#   bash /opt/upready-store/mt/deploy/auto/install.sh --instance intl \
#     --env-file /opt/upready-store/mt/shipshift.env --app-id <id> --live-sha <sha of what is live> --dry-run
#
# Nothing new goes on a live host without Ivan's ok: lead-upready-store asks him, shows him the --dry-run
# output of this script, and only then runs it without --dry-run. The tests run it in a temporary folder.
#
# Required:
#   --instance intl|ru
#   --env-file <path>        the host's own env file of the stack (INTL /opt/upready-store/mt/shipshift.env,
#                            RU /opt/upready-store/mt/ru-prod.env). Only its path is written anywhere.
#   --app-id <id>            the release GitHub App (deploy/auto/README.md), or --token-file <path>
# Options:
#   --app-key-file <path>    the App's private key, placed by Ivan (default
#                            /etc/upready-store-release/github-app.pem). This script checks that the file
#                            is there and never reads it.
#   --installation-id <id>   the App's installation on the repository (the agent asks GitHub when absent)
#   --token-file <path>      a file holding a GitHub token, instead of the App
#   --live-sha <sha>         the 40-character sha live on this host now: recorded in a new journal as
#                            «adopted», so the agent starts from the next one instead of releasing it again
#   --interval <time>        how long the agent rests between ticks (systemd time, default 2min)
#   --dry-run                print every file it would write and every command it would run; write and
#                            run nothing
#
# Environment overrides, for the tests only: RELEASE_INSTALL_ROOT (a prefix for /opt, /etc and /var),
# UNIT_DIR (default /etc/systemd/system), SYSTEMCTL_BIN (default systemctl).
#
# Exit codes: 0 done (or printed), 1 usage error, 2 a file could not be written, 3 systemctl failed.
set -euo pipefail

log() { echo "[install] $*" >&2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTANCE=""; ENV_FILE=""; APP_ID=""; APP_KEY=""; INSTALLATION_ID=""; TOKEN_FILE=""; LIVE_SHA=""
INTERVAL="2min"; DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --instance) INSTANCE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --app-id) APP_ID="${2:-}"; shift 2 ;;
    --app-key-file) APP_KEY="${2:-}"; shift 2 ;;
    --installation-id) INSTALLATION_ID="${2:-}"; shift 2 ;;
    --token-file) TOKEN_FILE="${2:-}"; shift 2 ;;
    --live-sha) LIVE_SHA="${2:-}"; shift 2 ;;
    --interval) INTERVAL="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) log "error: unknown argument $1"; exit 1 ;;
  esac
done

case "$INSTANCE" in intl|ru) ;; *) log "error: --instance must be intl or ru"; exit 1 ;; esac
case "$ENV_FILE" in /*) ;; *) log "error: --env-file must be an absolute path on this host"; exit 1 ;; esac
if [ -z "$APP_ID" ] && [ -z "$TOKEN_FILE" ]; then log "error: --app-id or --token-file is required"; exit 1; fi
if [ -n "$LIVE_SHA" ] && ! printf '%s' "$LIVE_SHA" | grep -qE '^[0-9a-f]{40}$'; then
  log "error: --live-sha must be a full 40-character sha"; exit 1
fi

ROOT="${RELEASE_INSTALL_ROOT:-}"
UNIT_DIR="${UNIT_DIR:-$ROOT/etc/systemd/system}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
CONF_DIR="$ROOT/etc/upready-store-release"
APP_KEY="${APP_KEY:-/etc/upready-store-release/github-app.pem}"
AGENT_DIR="$ROOT/opt/upready-store/auto"
STATE_DIR="$ROOT/var/lib/upready-store-release"
UNIT=upready-store-release

write_file() { # <path> <mode> <content>
  local path="$1" mode="$2" content="$3"
  if [ "$DRY_RUN" = 1 ]; then
    echo "--- would write $path (mode $mode) ---"
    echo "$content"
    echo "--- end $path ---"
    return 0
  fi
  mkdir -p "$(dirname "$path")" || { log "error: could not create $(dirname "$path")"; exit 2; }
  ( umask 077; printf '%s\n' "$content" >"$path" ) || { log "error: could not write $path"; exit 2; }
  chmod "$mode" "$path"
  log "wrote $path"
}
copy_file() { # <from> <to> <mode>
  local sum; sum="$( (sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | cut -d' ' -f1)"
  if [ "$DRY_RUN" = 1 ]; then echo "--- would copy $1 -> $2 (mode $3, sha256 $sum) ---"; return 0; fi
  mkdir -p "$(dirname "$2")" || { log "error: could not create $(dirname "$2")"; exit 2; }
  cp "$1" "$2" && chmod "$3" "$2" || { log "error: could not write $2"; exit 2; }
  log "wrote $2 (sha256 $sum)"
}
run() {
  if [ "$DRY_RUN" = 1 ]; then echo "--- would run: $* ---"; return 0; fi
  "$@" || { log "error: $* failed"; exit 3; }
}

# 1. The agent itself: a pinned copy. A merge into dev does not change what runs here; a new agent comes
#    only with a new run of this script.
copy_file "$HERE/release-agent.sh" "$AGENT_DIR/release-agent.sh" 755

# 2. Its configuration. Paths and ids only, no secret.
CONF="# The release agent of this host (deploy/auto/install.sh, t-2026-10-12-30). No secret in this file.
RELEASE_INSTANCE=$INSTANCE
RELEASE_ENV_FILE=$ENV_FILE
RELEASE_STATE_DIR=${STATE_DIR#$ROOT}"
if [ -n "$TOKEN_FILE" ]; then
  CONF="$CONF
GITHUB_TOKEN_FILE=$TOKEN_FILE"
else
  CONF="$CONF
GITHUB_APP_ID=$APP_ID
GITHUB_APP_KEY_FILE=$APP_KEY${INSTALLATION_ID:+
GITHUB_APP_INSTALLATION_ID=$INSTALLATION_ID}"
fi
write_file "$CONF_DIR/release.env" 600 "$CONF"

# 3. The journal, seeded with what is live, when there is no journal yet.
if [ -n "$LIVE_SHA" ] && [ ! -s "$STATE_DIR/journal.json" ]; then
  t="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_file "$STATE_DIR/journal.json" 644 "$(jq -n --arg i "$INSTANCE" --arg h "$(hostname)" --arg s "$LIVE_SHA" --arg t "$t" '
    {schema: "upready-store.release-journal/1", instance: $i, host: $h, records: [
      {id: "\($i)-adopted-\($s[0:8])", sha: $s, instance: $i, kind: "adopted", start: $t, end: $t, result: "adopted",
       step: null, step_name: null, reason: "live on this host when install.sh ran; recorded, not released",
       log: null, checks_run: null, after: null, switch: null, new_reds: [], published: true}]}')"
elif [ -s "$STATE_DIR/journal.json" ]; then
  log "the journal $STATE_DIR/journal.json is already there: kept as it is"
else
  log "no --live-sha: the first tick releases the newest green sha of dev, even when it is the one live now"
fi

# 4. The units: a oneshot service and the timer that runs it again two minutes after each run ends.
write_file "$UNIT_DIR/$UNIT.service" 644 "[Unit]
Description=upready-store release agent ($INSTANCE): releases green dev to this host (t-2026-10-12-30)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=RELEASE_AGENT_CONF=${CONF_DIR#$ROOT}/release.env
ExecStart=${AGENT_DIR#$ROOT}/release-agent.sh
TimeoutStartSec=3h
Nice=5"
write_file "$UNIT_DIR/$UNIT.timer" 644 "[Unit]
Description=Run the upready-store release agent ($INSTANCE) $INTERVAL after each run

[Timer]
OnActiveSec=1min
OnUnitInactiveSec=$INTERVAL

[Install]
WantedBy=timers.target"

run "$SYSTEMCTL_BIN" daemon-reload
run "$SYSTEMCTL_BIN" enable --now "$UNIT.timer"

# 5. What is left for Ivan, never done here.
if [ -z "$TOKEN_FILE" ] && [ ! -e "$ROOT$APP_KEY" ]; then
  log "the App key $APP_KEY is not on this host yet: the agent writes «no credentials» into its state until Ivan puts it there (chmod 600)"
fi
log "the switch is the repository variable AUTO_RELEASE_DEV: nothing is released until Ivan sets it to on"
log "watch: systemctl list-timers $UNIT.timer; journalctl -u $UNIT; ${STATE_DIR#$ROOT}/state.json"
log "done (instance=$INSTANCE, dry-run=$DRY_RUN)"
