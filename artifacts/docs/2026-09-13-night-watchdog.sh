#!/bin/zsh
# night-watchdog.sh — внешний сторож ночной задачи t-2026-09-13-01.
# Раз в 20 мин: PR смёржен → выход; транскрипт живой сессии не менялся >75 мин и PR не смёржен → поднять claude -p (не более 2 раз).
set -u
TRANSCRIPT="$HOME/.claude/projects/-Users-ivanprotsko-upready-worktrees-upready-store-hompage/a81dccdb-dc58-4695-b0ac-89fea842b047.jsonl"
WS="$HOME/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feature/homepage-rework"
PROMPT="$HOME/upready/worktrees/upready-store/hompage/artifacts/docs/2026-09-13-night-resume-prompt.md"
LOGDIR="$HOME/upready/.ai/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/night-watchdog-2026-09-13.log"
STALE=4500; MAX=2; n=0
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
log "watchdog start pid=$$ stale=${STALE}s max_launches=$MAX"
while true; do
  sleep 1200
  state="$(cd "$WS" 2>/dev/null && gh pr list --head feature/homepage-rework --state all --json state --jq '.[0].state' 2>/dev/null)"
  if [[ "$state" == "MERGED" ]]; then log "PR merged — exit"; exit 0; fi
  now=$(date +%s); mt=$(stat -f %m "$TRANSCRIPT" 2>/dev/null || echo 0); age=$(( now - mt ))
  log "tick pr=${state:-none} transcript_age=${age}s launches=$n"
  if (( age > STALE )) && (( n < MAX )); then
    n=$(( n + 1 ))
    log "session stale — launching claude -p #$n (log: $LOGDIR/night-relaunch-$n.log)"
    ( cd "$WS" && claude -p "$(cat "$PROMPT")" --model opus --allowedTools "Bash,Read,Write,Edit,Glob,Grep" > "$LOGDIR/night-relaunch-$n.log" 2>&1; log "claude -p #$n exited rc=$?" ) &
    sleep 3600
  fi
done
