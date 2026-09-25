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

# t-2026-09-25-17 (found by a real incident, W22/t-2026-09-25-18): every match below
# compares $DIR as a literal path segment against process cwd/command lines. A RELATIVE
# $DIR ("apps/backend") is a substring of every OTHER stand's backend too, so it matched
# and killed an unrelated worker's tree and this box's own :9251 in one call. $DIR is
# resolved to its absolute, physical form before it is used for anything else, and must
# name a real Medusa backend — not a throwaway or unrelated directory — in both real and
# --dry-run mode, since --dry-run is what this fix's own proof runs against real worktrees.
if [ ! -d "$DIR" ]; then
  echo "no such directory: $DIR" >&2
  exit 2
fi
DIR="$(cd "$DIR" && pwd -P)" || { echo "cannot resolve $DIR to an absolute path" >&2; exit 2; }
if [ ! -f "$DIR/package.json" ] || ! grep -q '"@medusajs/medusa"' "$DIR/package.json"; then
  echo "not a medusa backend dir (no @medusajs/medusa dependency in package.json): $DIR" >&2
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
# Two more conditions, both from the same t-2026-09-25-17 incident: (1) $DIR must match as a whole path
# segment — immediately followed by `/`, a space, or the end of the string — not a bare substring, so
# ".../apps/backend" does not also claim ".../apps/backend-v2"; (2) the command-line match keeps only
# node/npm/npx processes (by the last path segment of `ps`'s own `comm` column, whose first word covers the
# `npm exec medusa develop`-style rewritten titles too), never a shell or an agent's own `claude` process,
# either of which can carry $DIR as plain text somewhere in a much longer command line without running
# anything IN it.
#
# Every `cwd_pids`/`cmdline_pids` candidate is dropped if it is this very script ($$), an ANCESTOR of $$, a
# DESCENDANT of $$, or already dead by the time we look. `$DIR` is this script's own `$1`/`$2`, so it is a
# literal substring of the running script's own command line — and of every process ABOVE it too: whatever
# invoked this script (a caller's shell, an agent's `sh -c "… stand-restart-backend.sh $DIR …"` wrapper) has
# that same `$DIR` sitting right there in ITS OWN command line, one level up or more. A `$(...)` subshell is a
# fork, not an exec, so `ps` also reports EVERY subshell this script forks (each pipeline stage above included)
# under that SAME command line, each with a different pid — the whole tree of this script's own helper
# subshells, not just its own single pid. A plain `command line contains $DIR` search therefore matches this
# script's entire lineage in both directions; the ancestor list plus the per-candidate descendant walk below is
# what tells those apart from a real, unrelated process that merely happens to run inside $DIR.
stand_pids() {
  local port="$1" dir="$2"
  local listeners cwd_pids cmdline_pids node_pids tree children
  listeners="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
  cwd_pids="$(lsof -a -d cwd -Fpn 2>/dev/null | MATCH_DIR="$dir" awk '
    /^p/ { pid = substr($0, 2) }
    /^n/ {
      d = ENVIRON["MATCH_DIR"]
      idx = index($0, d)
      if (idx == 0) next
      nc = substr($0, idx + length(d), 1)
      if (nc == "" || nc == "/" || nc == " ") print pid
    }
  ' | tr '\n' ' ')"
  node_pids="$(ps -Awwo pid=,comm= 2>/dev/null | awk '
    match($0, /^[ ]*[0-9]+/) {
      pid = substr($0, RSTART, RLENGTH) + 0
      rest = substr($0, RSTART + RLENGTH)
      sub(/^[ ]+/, "", rest)
      n = split(rest, segs, "/")
      split(segs[n], toks, " ")
      base = toks[1]
      if (base == "node" || base == "npm" || base == "npx") print pid
    }
  ' | tr '\n' ' ')"
  cmdline_pids="$(ps -Awwo pid=,command= 2>/dev/null | MATCH_DIR="$dir" NODE_PIDS=" $node_pids " awk '
    {
      pid = $1
      d = ENVIRON["MATCH_DIR"]
      idx = index($0, d)
      if (idx == 0) next
      nc = substr($0, idx + length(d), 1)
      if (nc != "" && nc != "/" && nc != " ") next
      if (index(ENVIRON["NODE_PIDS"], " " pid " ") == 0) next
      print pid
    }
  ' | tr '\n' ' ')"

  local self="$$" ancestors ap candidate cur hops is_ancestor self_chain
  ancestors=""
  ap="$self"; hops=0
  while [ -n "$ap" ] && [ "$hops" -lt 50 ]; do
    ancestors="$ancestors $ap"
    [ "$ap" = "1" ] && break
    ap="$(ps -o ppid= -p "$ap" 2>/dev/null | tr -d ' ')"
    hops=$((hops + 1))
  done

  tree=""
  for candidate in $cwd_pids $cmdline_pids; do
    kill -0 "$candidate" 2>/dev/null || continue

    is_ancestor=0
    for ap in $ancestors; do
      [ "$candidate" = "$ap" ] && { is_ancestor=1; break; }
    done
    [ "$is_ancestor" -eq 1 ] && continue

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
