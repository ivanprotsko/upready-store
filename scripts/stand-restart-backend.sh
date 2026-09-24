#!/bin/bash
# Restart a local stand backend that runs under `medusa develop` — the whole process tree, not one process.
#
# Why this exists (aiBugs.md 2026-09-24, lead upready-store): `medusa develop` is an npm wrapper → medusa cli
# wrapper → server child that holds the port. The wrapper respawns the child only on a watched file change,
# never when the child dies, and it does not notice `git checkout` or an `.env` edit. Killing one process of
# the tree therefore leaves either a dead port (child killed, wrapper idle) or two trees fighting for the port
# (a second `npx medusa develop` started next to a living wrapper → EADDRINUSE). The only safe restart is:
# kill every process of the tree, confirm the port is free, start exactly one new tree, wait for /health.
#
# Usage:
#   scripts/stand-restart-backend.sh <apps/backend dir> <port> [log file]
# Example (lead's stand):
#   scripts/stand-restart-backend.sh /Users/ivanprotsko/upready/worktrees/upready-store/feat/o21-storefront-visual-cherkashino/apps/backend 9121 \
#     /Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/stand-backend-9121.log
# Exit codes: 0 healthy; 2 bad arguments; 3 port still busy after the kill; 4 no /health 200 within the timeout.
set -u

DIR="${1:-}"
PORT="${2:-}"
LOG="${3:-/tmp/stand-backend-${PORT:-x}.log}"
TIMEOUT_S="${STAND_RESTART_TIMEOUT_S:-120}"

if [ -z "$DIR" ] || [ -z "$PORT" ] || { [ ! -f "$DIR/medusa-config.ts" ] && [ ! -f "$DIR/medusa-config.js" ]; }; then
  echo "usage: $0 <apps/backend dir with medusa-config> <port> [log file]" >&2
  exit 2
fi
case "$PORT" in ''|*[!0-9]*) echo "port must be a number, got '$PORT'" >&2; exit 2;; esac

# 1. Every process of the previous tree: whatever listens on the port, plus every process whose command line
#    names this backend dir and medusa (npm wrapper, cli wrapper, child, tsx/ts-node helpers).
listeners="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
tree="$(pgrep -f "$DIR.*medusa|medusa.*develop.*$DIR|npm exec medusa develop" 2>/dev/null | tr '\n' ' ')"
children=""
for p in $listeners $tree; do children="$children $(pgrep -P "$p" 2>/dev/null | tr '\n' ' ')"; done
victims="$(printf '%s %s %s\n' "$listeners" "$tree" "$children" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ')"
if [ -n "$victims" ]; then
  echo "killing previous tree: $victims"
  for p in $victims; do ps -o pid=,ppid=,lstart=,command= -p "$p" 2>/dev/null | cut -c1-140; done
  # shellcheck disable=SC2086
  kill -9 $victims 2>/dev/null
  sleep 2
else
  echo "no previous tree found (nothing on :$PORT, no medusa process for $DIR)"
fi

if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port :$PORT is still busy after the kill: $(lsof -tiTCP:"$PORT" -sTCP:LISTEN | tr '\n' ' ') — not starting a second tree" >&2
  exit 3
fi

# 2. Exactly one new tree.
cd "$DIR" || exit 2
echo "=== $(date '+%F %T') stand-restart-backend.sh: start on $(git rev-parse --short HEAD 2>/dev/null || echo '?') :$PORT" >>"$LOG"
(PORT="$PORT" nohup nice -n 10 npx medusa develop >>"$LOG" 2>&1 &)

# 3. Wait for /health.
waited=0
while [ "$waited" -lt "$TIMEOUT_S" ]; do
  sleep 3; waited=$((waited + 3))
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:$PORT/health" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    echo "healthy after ${waited}s: listener $(lsof -tiTCP:"$PORT" -sTCP:LISTEN | tr '\n' ' ')| tree: $(pgrep -f "$DIR.*medusa|npm exec medusa develop" | tr '\n' ' ')"
    exit 0
  fi
done
echo "no /health 200 on :$PORT within ${TIMEOUT_S}s — see $LOG (last lines follow)" >&2
tail -n 15 "$LOG" >&2
exit 4
