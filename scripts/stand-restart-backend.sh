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
# Machine has several stands at once (t-2026-09-25-17): a plain `pgrep -f "…|npm exec medusa develop"` matches
# the backend of EVERY stand on the box, so restarting one used to kill them all. `stand_pids` below only
# counts a process as this stand's own when the listener is on THIS stand's `$PORT`, or the process's own
# working directory (`lsof -a -d cwd`) or full command line names THIS stand's `$DIR` — never the bare
# "medusa develop" pattern, which names no stand at all.
#
# Usage:
#   scripts/stand-restart-backend.sh [--dry-run] <apps/backend dir> <port> [log file]
# Example (lead's stand):
#   scripts/stand-restart-backend.sh /Users/ivanprotsko/upready/worktrees/upready-store/feat/o21-storefront-visual-cherkashino/apps/backend 9121 \
#     /Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/stand-backend-9121.log
# --dry-run prints the PIDs the script would stop for this DIR/PORT and exits 0 without touching anything or
# starting a new tree. It does not require a real `medusa-config.ts` at DIR, so it can audit or be proved
# against a throwaway directory.
# Exit codes: 0 healthy (or a clean --dry-run); 2 bad arguments; 3 port still busy after the kill; 4 no /health 200 within the timeout.
set -u

DRY_RUN=0
args=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) args+=("$arg") ;;
  esac
done

DIR="${args[0]:-}"
PORT="${args[1]:-}"
LOG="${args[2]:-/tmp/stand-backend-${PORT:-x}.log}"
TIMEOUT_S="${STAND_RESTART_TIMEOUT_S:-120}"

if [ -z "$DIR" ] || [ -z "$PORT" ]; then
  echo "usage: $0 [--dry-run] <apps/backend dir with medusa-config> <port> [log file]" >&2
  exit 2
fi
if [ "$DRY_RUN" -eq 0 ] && [ ! -f "$DIR/medusa-config.ts" ] && [ ! -f "$DIR/medusa-config.js" ]; then
  echo "usage: $0 [--dry-run] <apps/backend dir with medusa-config> <port> [log file]" >&2
  exit 2
fi
case "$PORT" in ''|*[!0-9]*) echo "port must be a number, got '$PORT'" >&2; exit 2;; esac

# Every PID that belongs to THIS stand: the listener on $PORT, any process whose cwd or full command line
# names $DIR, plus their immediate children (the npm wrapper's own child, mainly). Printed one PID per line
# to stdout so callers can `tr '\n' ' '` or count them; stderr and logging stay with the caller.
#
# $DIR is passed to awk through MATCH_DIR (an environment variable), never `-v dir=…`: `-v` bakes the value
# into awk's own argv, which `ps` then reports back, so the search matched awk's OWN row too. A plain env var
# never shows up in `ps`'s COMMAND column.
#
# Every `cwd_pids`/`cmdline_pids` candidate is walked up its ppid chain and dropped if that chain leads back
# to `$$` (this very script), or if the candidate is already dead by the time we look. `$DIR` is this script's
# own `$1`/`$2`, so it is always a literal substring of the running script's own command line — and a `$(...)`
# subshell is a fork, not an exec, so `ps` reports EVERY subshell this script forks (each pipeline stage above
# included) under that SAME command line, each with a different pid. A plain `command line contains $DIR`
# search therefore matches not just this script's own pid but the whole tree of its own helper subshells; the
# walk below is what tells those apart from a real, unrelated process that merely happens to run inside $DIR.
stand_pids() {
  local port="$1" dir="$2"
  local listeners cwd_pids cmdline_pids tree children
  listeners="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
  cwd_pids="$(lsof -a -d cwd -Fpn 2>/dev/null | MATCH_DIR="$dir" awk '
    /^p/ { pid = substr($0, 2) }
    /^n/ { if (index($0, ENVIRON["MATCH_DIR"]) > 0) print pid }
  ' | tr '\n' ' ')"
  cmdline_pids="$(ps -Awwo pid=,command= 2>/dev/null | MATCH_DIR="$dir" awk '
    index($0, ENVIRON["MATCH_DIR"]) > 0 { print $1 }
  ' | tr '\n' ' ')"

  local self="$$" candidate cur hops self_chain
  tree=""
  for candidate in $cwd_pids $cmdline_pids; do
    kill -0 "$candidate" 2>/dev/null || continue
    cur="$candidate"; hops=0; self_chain=0
    while [ -n "$cur" ] && [ "$cur" != "0" ] && [ "$cur" != "1" ] && [ "$hops" -lt 50 ]; do
      [ "$cur" = "$self" ] && { self_chain=1; break; }
      cur="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ')"
      hops=$((hops + 1))
    done
    [ "$self_chain" -eq 0 ] && tree="$tree $candidate"
  done

  children=""
  for p in $listeners $tree; do children="$children $(pgrep -P "$p" 2>/dev/null | tr '\n' ' ')"; done
  printf '%s %s %s\n' "$listeners" "$tree" "$children" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u
}

victims="$(stand_pids "$PORT" "$DIR" | tr '\n' ' ')"

if [ "$DRY_RUN" -eq 1 ]; then
  if [ -n "$victims" ]; then
    echo "dry-run: would stop: $victims"
    for p in $victims; do ps -o pid=,ppid=,lstart=,command= -p "$p" 2>/dev/null | cut -c1-140; done
  else
    echo "dry-run: nothing to stop for $DIR on :$PORT"
  fi
  exit 0
fi

# 1. Every process of the previous tree.
if [ -n "$victims" ]; then
  echo "killing previous tree: $victims"
  for p in $victims; do ps -o pid=,ppid=,lstart=,command= -p "$p" 2>/dev/null | cut -c1-140; done
  # shellcheck disable=SC2086
  kill -9 $victims 2>/dev/null
  sleep 2
else
  echo "no previous tree found (nothing on :$PORT, no process for $DIR)"
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
    echo "healthy after ${waited}s: tree: $(stand_pids "$PORT" "$DIR" | tr '\n' ' ')"
    exit 0
  fi
done
echo "no /health 200 on :$PORT within ${TIMEOUT_S}s — see $LOG (last lines follow)" >&2
tail -n 15 "$LOG" >&2
exit 4
