#!/bin/bash
# sentinel.sh — будильник штабной сессии: печатает СТРОКУ только когда нужно вмешательство
# (новая задача в needs-ivan/failed/blocked, файл blocked-*.md, DONE, мёртвый диспетчер, затянувшийся лимит)
# плюс пульс раз в 3 часа. Каждая строка stdout = уведомление сессии (Monitor persistent).
D="/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
last_sig=""; last_beat=$(date +%s); limit_since=0
while true; do
  sig=$(node -e '
    const fs=require("fs"); const D=process.argv[1];
    let s; try { s=JSON.parse(fs.readFileSync(D+"/state.json","utf8")); } catch { console.log("state-unreadable"); process.exit(0); }
    const bad=Object.entries(s.tasks).filter(([k,v])=>["needs-ivan","failed","blocked"].includes(v.status)).map(([k,v])=>k+":"+v.status).sort();
    const blocked=fs.readdirSync(D+"/logs").filter(f=>/^blocked-.*\.md$/.test(f)).sort();
    const done=fs.existsSync(D+"/DONE");
    const tickAge=(Date.now()-Date.parse(s.dispatcher.lastTick||0))/60000;
    const dead=tickAge>12;
    const limited=!!(s.dispatcher.limitUntil && Date.parse(s.dispatcher.limitUntil)>Date.now());
    const cnt={}; for(const v of Object.values(s.tasks)) cnt[v.status]=(cnt[v.status]||0)+1;
    console.log(JSON.stringify({bad,blocked,done,dead,limited,cnt,tickAge:Math.round(tickAge)}));
  ' "$D" 2>/dev/null)
  now=$(date +%s)
  key=$(printf '%s' "$sig" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(JSON.stringify([j.bad,j.blocked,j.done,j.dead]))}catch{console.log(s)}})')
  if [ "$key" != "$last_sig" ]; then
    [ -n "$last_sig" ] && echo "[sentinel $(date '+%Y-%m-%d %H:%M WITA')] ВНИМАНИЕ: $sig"
    last_sig="$key"
  fi
  if printf '%s' "$sig" | grep -q '"limited":true'; then
    [ "$limit_since" -eq 0 ] && limit_since=$now
    if [ $((now-limit_since)) -gt 2400 ]; then echo "[sentinel $(date '+%Y-%m-%d %H:%M WITA')] ЛИМИТ держится >40 мин: $sig"; limit_since=$now; fi
  else limit_since=0; fi
  if [ $((now-last_beat)) -ge 10800 ]; then echo "[sentinel $(date '+%Y-%m-%d %H:%M WITA')] пульс: $sig"; last_beat=$now; fi
  printf '%s' "$sig" | grep -q '"done":true' && { echo "[sentinel] DONE — день завершён, сторож выходит"; exit 0; }
  sleep 120
done
