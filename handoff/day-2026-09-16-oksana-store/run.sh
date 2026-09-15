#!/bin/bash
# run.sh — сторож дня (приказ Ивана: «предусмотри пробуждение автоматическое если что-то прервется»).
# Вызывается cron'ом каждые 5 минут и вручную. Поднимает UI и диспетчер, если они не живы; будит Superset host; держит Mac без сна (caffeinate).
# Диспетчер стартует только когда есть tasks.json с задачами и файл ARMED (взводит подготовительная сессия). Файл DONE = всё, STOP = пауза (диспетчер живёт, но не запускает).
export PATH="/Users/ivanprotsko/.local/bin:/Users/ivanprotsko/superset/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME=/Users/ivanprotsko
D="/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store"
LOG="$D/logs"; mkdir -p "$LOG"
ts() { date '+%F %T'; }
alive() { local f="$1"; local p; p=$(cat "$f" 2>/dev/null || echo 0); [ "${p:-0}" -gt 1 ] && kill -0 "$p" 2>/dev/null; }

# 1. caffeinate — один экземпляр на весь день
if ! alive "$D/caffeinate.pid"; then nohup caffeinate -dimsu -t 86400 >/dev/null 2>&1 & echo $! > "$D/caffeinate.pid"; echo "[$(ts)] caffeinate started $(cat "$D/caffeinate.pid")" >> "$LOG/runner.log"; fi

# 2. Superset host (агенты build-задач живут в его workspace)
if ! superset status --json 2>/dev/null | grep -q '"healthy": *true'; then
  echo "[$(ts)] superset host not healthy → superset start" >> "$LOG/runner.log"
  superset start >> "$LOG/runner.log" 2>&1
  if ! pgrep -f 'Superset.app/Contents/MacOS/Superset' >/dev/null; then open -a Superset >> "$LOG/runner.log" 2>&1; fi
fi

# 3. UI — всегда
if ! alive "$D/ui.pid"; then ( cd "$D" && exec nohup node ui/server.mjs >> "$LOG/ui.log" 2>&1 ) & echo $! > "$D/ui.pid"; echo "[$(ts)] ui started $(cat "$D/ui.pid")" >> "$LOG/runner.log"; fi

# 4. Диспетчер — когда взведён
if [ -f "$D/DONE" ]; then exit 0; fi
if [ -f "$D/ARMED" ] && [ -f "$D/tasks.json" ] && node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(t.tasks&&t.tasks.length?0:1)' "$D/tasks.json"; then
  if ! alive "$D/dispatcher.pid"; then
    ( cd "$D" && exec nohup node dispatcher.mjs run >> "$LOG/dispatcher.out" 2>&1 ) & echo $! > "$D/dispatcher.pid"
    # exec: подоболочка становится самим node, иначе в pid-файле лежал pid подоболочки, а node жил сиротой
    echo "[$(ts)] dispatcher started $(cat "$D/dispatcher.pid")" >> "$LOG/runner.log"
  fi
fi
# 5. Пульс диспетчера: если процесс жив, но тик старше 10 мин — перезапуск
if alive "$D/dispatcher.pid" && [ $(( $(date +%s) - $(stat -f %m "$D/dispatcher.pid") )) -gt 600 ]; then
  if ! node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=Date.parse(s.dispatcher.lastTick||0);process.exit(Date.now()-t<600000?0:1)' "$D/state.json" 2>/dev/null; then
    echo "[$(ts)] dispatcher stale tick → restart" >> "$LOG/runner.log"; kill "$(cat "$D/dispatcher.pid")" 2>/dev/null; rm -f "$D/dispatcher.pid"
  fi
fi
# 6. Сводка Ивану в его же «Избранное» Telegram — не чаще раза в час и только при изменении отчёта (получатель — сам Иван)
if [ -f "$D/ARMED" ]; then OUTREACH_OK=1 /Users/ivanprotsko/upready/projects/tg-reply-copilot/.venv/bin/python "$D/notify.py" >> "$LOG/notify.log" 2>&1; fi

# 7. Диск: меньше 20 ГБ свободно → чистим npm-кэш (регенерируемый; 13:27 WITA он занял 29 ГБ и положил всё под ENOSPC)
#    и сигналим сторожу файлом blocked-disk.md; когда места снова достаточно — файл переезжает в resolved-.
avail=$(df -g / | awk 'NR==2{print $4}')
if [ -n "$avail" ] && [ "$avail" -lt 20 ]; then
  npm cache clean --force >/dev/null 2>&1
  echo "[$(ts)] disk low: ${avail}G free — npm cache cleaned" >> "$LOG/runner.log"
  echo "# диск: ${avail} ГБ свободно на $(ts) — npm-кэш очищен автоматически; если всё ещё мало, чистить node_modules/.next в worktree СМЁРЖЕННЫХ задач" > "$D/logs/blocked-disk.md"
elif [ -f "$D/logs/blocked-disk.md" ]; then
  mv "$D/logs/blocked-disk.md" "$D/logs/resolved-blocked-disk-$(date +%H%M).md"
fi
