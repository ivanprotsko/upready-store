#!/usr/bin/env bash
# up.sh — start (or re-apply) a placeholder on a host. Run as root on the host, from any cwd:
#   /opt/upready-store/placeholder/up.sh ru 'Host(`olavka.ru`) || Host(`www.olavka.ru`)'
#   /opt/upready-store/placeholder/up.sh en 'Host(`olavka.com`) || Host(`www.olavka.com`)'
# A second page on the same host takes a name and, when its rule shares the host with another
# router, a priority (t-2026-10-07-08):
#   /opt/upready-store/placeholder/up.sh store 'Host(`store.upready.dev`) && Path(`/`)' store 300
# A page with files of its own (fonts, pictures under html-<page>/landing/) names that path too
# (t-2026-10-08-35, the school landing):
#   /opt/upready-store/placeholder/up.sh school 'Host(`school.cherkashina.ru`) && (Path(`/`) || PathPrefix(`/landing/`))' school 300
# Writes the env file next to this script, pulls nginx:alpine if missing, brings the compose
# project up and fetches the page on the host for every Host(...) in the rule
# (-k: until the domain's A record points here, traefik answers with its default certificate).
# Without a name the project is `placeholder` and the container `olavka-placeholder`, as before;
# with one they are `placeholder-<name>` and `<name>-placeholder`.
set -euo pipefail
USAGE="usage: up.sh <ru|en|store|school> '<traefik rule>' [name] [priority]"
LANG_CODE="${1:?$USAGE}"
RULE="${2:?$USAGE}"
NAME="${3:-olavka}"
PRIORITY="${4:-0}"
PH="$(cd "$(dirname "$0")" && pwd)"
[ -d "$PH/html-$LANG_CODE" ] || { echo "up.sh: no html-$LANG_CODE directory in $PH" >&2; exit 1; }
if [ "$NAME" = olavka ]; then PROJECT=placeholder; else PROJECT="placeholder-$NAME"; fi
ENV_FILE="$PH/$PROJECT.env"
printf 'PH_RULE=%s\nPH_LANG=%s\nPH_DIR=%s\nPH_NAME=%s\nPH_PRIORITY=%s\n' \
  "$RULE" "$LANG_CODE" "$PH" "$NAME" "$PRIORITY" > "$ENV_FILE"
docker image inspect nginx:alpine >/dev/null 2>&1 || docker pull nginx:alpine
docker compose -p "$PROJECT" -f "$PH/compose.placeholder.yml" --env-file "$ENV_FILE" up -d
sleep 5
for h in $(printf '%s' "$RULE" | grep -o 'Host(`[^`]*`)' | sed 's/Host(`//; s/`)//'); do
  printf '%-24s https → %s\n' "$h" "$(curl -sS -k -o /dev/null -m 15 -w '%{http_code}' --resolve "$h:443:127.0.0.1" "https://$h/" || true)"
done
docker ps --filter "name=$NAME-placeholder" --format '{{.Names}} {{.Status}}'
