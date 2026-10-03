#!/usr/bin/env bash
# Minute-by-minute uptime + CPU/RAM/disk monitor for the RU host
# (t-cherk-25/t-2026-10-03-23): deploy/observability/RUNBOOK.md's external
# uptime monitor checks only HTTP endpoints, from outside the host, on a
# 5-minute floor on its free tier — neither fast enough for "every minute"
# nor able to see the host's own CPU/RAM/disk. This script runs ON the host
# instead, once a minute (RUNBOOK-RU.md wires the systemd timer), and alerts
# into the same Telegram bot the owner already receives order notifications
# from, through the plain `sendMessage` webhook call
# deploy/observability/RUNBOOK.md step 3 already uses — no new bot, no new
# token.
#
# What it does NOT replace: deploy/observability/RUNBOOK.md's own external
# probe still matters, because this script cannot alert on the one failure
# that matters most — the host being down or unreachable. Run both.
#
# Usage:
#   deploy/scripts/ru-host-monitor.sh
#
# Required environment (RUNBOOK-RU.md's own env file, sourced by the systemd
# service, never printed by this script):
#   MONITOR_HEALTH_URL        e.g. https://cherkashino.ru/healthz or
#                              http://127.0.0.1:9000/health for a pre-DNS check
#   MONITOR_TELEGRAM_BOT_TOKEN   the bot token sendMessage is called with
#   MONITOR_TELEGRAM_CHAT_ID     where an alert lands
# Optional:
#   MONITOR_STATE_DIR         default /var/lib/ru-host-monitor — where the
#                              "already alerted" markers live, so a problem
#                              that stays broken sends one alert per hour, not
#                              one every minute
#   MONITOR_DISK_PATH         default /
#   MONITOR_RAM_THRESHOLD_PCT default 90
#   MONITOR_DISK_THRESHOLD_PCT default 85
#   MONITOR_LOAD_THRESHOLD    default: number of CPUs (load1 > this = alert)
#   MONITOR_REALERT_MINUTES   default 60 — re-send an alert for a condition
#                              that is STILL true after this many minutes,
#                              rather than staying silent until it clears
#
# Exit codes: 0 always, on purpose — a monitor that crashes the systemd unit
# on a transient curl failure stops monitoring instead of reporting one. Every
# problem this script finds is reported through Telegram, not through its own
# exit code.
set -uo pipefail

STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/ru-host-monitor}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
REALERT_MINUTES="${MONITOR_REALERT_MINUTES:-60}"
REALERT_SECONDS=$(( REALERT_MINUTES * 60 ))

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ru-host-monitor] $*"; }

alert() { # <key> <message>
  local key="$1" message="$2" marker="$STATE_DIR/$1.alerted"
  if [ -f "$marker" ]; then
    local last now; last="$(cat "$marker" 2>/dev/null || echo 0)"; now="$(date +%s)"
    if [ $(( now - last )) -lt "$REALERT_SECONDS" ]; then
      log "suppressed (already alerted within ${REALERT_MINUTES}m): $message"
      return 0
    fi
  fi
  date +%s > "$marker"
  log "ALERT: $message"
  if [ -n "${MONITOR_TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${MONITOR_TELEGRAM_CHAT_ID:-}" ]; then
    curl -sS -m 10 "https://api.telegram.org/bot${MONITOR_TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${MONITOR_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=RU host: $message" >/dev/null || log "Telegram sendMessage failed (network?)"
  fi
}

clear_alert() { # <key> — called once a condition is healthy again, so the next breach re-alerts immediately rather than waiting out the suppression window
  rm -f "$STATE_DIR/$1.alerted" 2>/dev/null || true
}

check_uptime() {
  [ -n "${MONITOR_HEALTH_URL:-}" ] || { log "MONITOR_HEALTH_URL not set — skipping the uptime check"; return 0; }
  # curl itself already writes "000" via -w on a connection failure, so the
  # fallback below only fires when curl printed NOTHING at all (e.g. killed by
  # the -m timeout mid-write) — `|| echo 000` would otherwise concatenate onto
  # curl's own "000" with no separating newline and read as "000000".
  local code; code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$MONITOR_HEALTH_URL" 2>/dev/null)"
  code="${code:-000}"
  if [ "$code" = "200" ]; then
    clear_alert uptime
    log "uptime ok: $MONITOR_HEALTH_URL -> 200"
  else
    alert uptime "$MONITOR_HEALTH_URL answered $code (expected 200)"
  fi
}

check_ram() {
  local pct; pct="$(free | awk '/^Mem:/ {printf "%d", ($2-$7)/$2*100}' 2>/dev/null)"
  [ -n "$pct" ] || { log "could not read RAM usage"; return 0; }
  local threshold="${MONITOR_RAM_THRESHOLD_PCT:-90}"
  if [ "$pct" -ge "$threshold" ]; then
    alert ram "RAM at ${pct}% (threshold ${threshold}%)"
  else
    clear_alert ram
    log "ram ok: ${pct}%"
  fi
}

check_disk() {
  local path="${MONITOR_DISK_PATH:-/}"
  local pct; pct="$(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
  [ -n "$pct" ] || { log "could not read disk usage for $path"; return 0; }
  local threshold="${MONITOR_DISK_THRESHOLD_PCT:-85}"
  if [ "$pct" -ge "$threshold" ]; then
    alert disk "disk $path at ${pct}% (threshold ${threshold}%)"
  else
    clear_alert disk
    log "disk ok: $path ${pct}%"
  fi
}

check_load() {
  local load1; load1="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"
  [ -n "$load1" ] || { log "could not read /proc/loadavg"; return 0; }
  local cpus; cpus="$(nproc 2>/dev/null || echo 1)"
  local threshold="${MONITOR_LOAD_THRESHOLD:-$cpus}"
  # integer compare: load1 is a decimal (e.g. "2.37") — compare via awk, not [ -ge ]
  if awk -v l="$load1" -v t="$threshold" 'BEGIN { exit !(l > t) }'; then
    alert load "load average $load1 over ${threshold} ($cpus CPUs)"
  else
    clear_alert load
    log "load ok: $load1 (threshold $threshold, $cpus CPUs)"
  fi
}

check_uptime
check_ram
check_disk
check_load
exit 0
