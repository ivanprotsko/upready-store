#!/usr/bin/env bash
# deploy/auto/uninstall.sh: stops the release agent of this host and takes its units and its pinned copy
# away (t-2026-10-12-30). The journal, the state, the logs, the configuration and the App key stay: the
# history of the releases is never deleted, and the key is Ivan's.
#
#   bash /opt/upready-store/mt/deploy/auto/uninstall.sh [--dry-run]
#
# To pause releases, Ivan sets AUTO_RELEASE_DEV to off instead; this script is for taking the agent off a
# host altogether, with Ivan's ok like every change to a live host.
#
# Environment overrides, for the tests only: RELEASE_INSTALL_ROOT, UNIT_DIR, SYSTEMCTL_BIN.
# Exit codes: 0 done (or printed), 1 usage error, 3 systemctl failed.
set -euo pipefail

log() { echo "[uninstall] $*" >&2; }
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    *) log "error: unknown argument $1"; exit 1 ;;
  esac
done

ROOT="${RELEASE_INSTALL_ROOT:-}"
UNIT_DIR="${UNIT_DIR:-$ROOT/etc/systemd/system}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
UNIT=upready-store-release

run() {
  if [ "$DRY_RUN" = 1 ]; then echo "--- would run: $* ---"; return 0; fi
  "$@" || { log "error: $* failed"; exit 3; }
}
remove() {
  [ -e "$1" ] || { log "not there: $1"; return 0; }
  if [ "$DRY_RUN" = 1 ]; then echo "--- would remove $1 ---"; return 0; fi
  rm -f "$1"; log "removed $1"
}

run "$SYSTEMCTL_BIN" disable --now "$UNIT.timer"
remove "$UNIT_DIR/$UNIT.timer"
remove "$UNIT_DIR/$UNIT.service"
remove "$ROOT/opt/upready-store/auto/release-agent.sh"
run "$SYSTEMCTL_BIN" daemon-reload
log "kept: $ROOT/var/lib/upready-store-release (journal, state, logs), $ROOT/etc/upready-store-release (configuration, key)"
log "done (dry-run=$DRY_RUN)"
