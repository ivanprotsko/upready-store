#!/usr/bin/env bash
# up.sh — start (or re-apply) the placeholder on a host. Run as root on the host, from any cwd:
#   /opt/upready-store/placeholder/up.sh ru 'Host(`olavka.ru`) || Host(`www.olavka.ru`)'
#   /opt/upready-store/placeholder/up.sh en 'Host(`olavka.com`) || Host(`www.olavka.com`)'
# Writes placeholder.env next to this file, pulls nginx:alpine if missing, brings the compose
# project `placeholder` up and fetches the page on the host for every Host(...) in the rule
# (-k: until the domain's A record points here, traefik answers with its default certificate).
set -euo pipefail
LANG_CODE="${1:?usage: up.sh <ru|en> '<traefik host rule>'}"
RULE="${2:?usage: up.sh <ru|en> '<traefik host rule>'}"
PH="$(cd "$(dirname "$0")" && pwd)"
[ -d "$PH/html-$LANG_CODE" ] || { echo "up.sh: no html-$LANG_CODE directory in $PH" >&2; exit 1; }
printf 'PH_RULE=%s\nPH_LANG=%s\nPH_DIR=%s\n' "$RULE" "$LANG_CODE" "$PH" > "$PH/placeholder.env"
docker image inspect nginx:alpine >/dev/null 2>&1 || docker pull nginx:alpine
docker compose -p placeholder -f "$PH/compose.placeholder.yml" --env-file "$PH/placeholder.env" up -d
sleep 5
for h in $(printf '%s' "$RULE" | grep -o 'Host(`[^`]*`)' | sed 's/Host(`//; s/`)//'); do
  printf '%-24s https → %s\n' "$h" "$(curl -sS -k -o /dev/null -m 15 -w '%{http_code}' --resolve "$h:443:127.0.0.1" "https://$h/" || true)"
done
docker ps --filter name=olavka-placeholder --format '{{.Names}} {{.Status}}'
