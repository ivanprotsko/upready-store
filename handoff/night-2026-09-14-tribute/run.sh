#!/bin/bash
# Night runner: relaunches the orchestrator until DONE or the deadline. Installed 2026-09-14 by the planning session.
# Retries on usage-limit / auth failures every 15 min; single instance via run.pid.
export PATH="/opt/homebrew/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME=/Users/ivanprotsko
CLAUDE="claude: aliased to command claude --strict-mcp-config --mcp-config ~/.claude/mcp-profiles/none.json --model sonnet"
D="/Users/ivanprotsko/upready/projects/upready-store/handoff/night-2026-09-14-tribute"
PROJ=/Users/ivanprotsko/upready/projects/upready-store
LOG="$D/logs"
if [ -f "$D/run.pid" ] && kill -0 "$(cat "$D/run.pid")" 2>/dev/null; then echo "already running pid $(cat "$D/run.pid")"; exit 0; fi
echo $$ > "$D/run.pid"
DEADLINE=$(date -j -f "%Y-%m-%d %H:%M" "2026-09-14 18:30" +%s)
attempt=0; MODEL_ARGS=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  [ -f "$D/DONE" ] && { echo "DONE present"; rm -f "$D/run.pid"; exit 0; }
  attempt=$((attempt+1)); ts=$(date +%Y%m%d-%H%M%S); out="$LOG/run-$attempt-$ts.log"
  echo "[$(date '+%F %T')] attempt $attempt model=${MODEL_ARGS:-default}" >> "$LOG/runner.log"
  start=$(date +%s)
  ( cd "$PROJ" && "$CLAUDE" -p "$(cat "$D/orchestrator-prompt.md")" --dangerously-skip-permissions --output-format text $MODEL_ARGS ) > "$out" 2>&1
  rc=$?; dur=$(( $(date +%s) - start ))
  echo "[$(date '+%F %T')] attempt $attempt rc=$rc dur=${dur}s" >> "$LOG/runner.log"
  [ -f "$D/DONE" ] && { rm -f "$D/run.pid"; exit 0; }
  if grep -qiE "usage limit|rate limit|limit reached|hit your limit|out of credits|not logged in|authentication" "$out"; then
    # Fable-specific limit → fall back to opus on later attempts; then wait
    grep -qi "fable" "$out" && MODEL_ARGS="--model opus"
    sleep 900; continue
  fi
  if [ "$dur" -lt 120 ]; then sleep 600; else sleep 60; fi
done
rm -f "$D/run.pid"
