#!/usr/bin/env bash
# ru-smoke.sh — the automatic part of docs/instances/ru-release-checklist.md.
# Run it from any machine after every RU deploy, and against the local stand before showing Ivan a change:
#
#   deploy/scripts/ru-smoke.sh                 # live shop: https://cherkashino.ru + https://api.cherkashino.ru
#   deploy/scripts/ru-smoke.sh --stand         # local stand: http://cherkashino-ru.localhost:8700 + http://localhost:9700
#   deploy/scripts/ru-smoke.sh --ssh           # live shop + host checks over ssh (Robokassa test mode, backups)
#
# Overrides: SMOKE_BASE (storefront origin), SMOKE_API (backend origin), SMOKE_HOST (host the shop is
# resolved for), SMOKE_SSH (ssh target, default root@201.34.137.28 with ~/.ssh/id_ed25519_do).
# Prints one line per check, «OK» or «FAIL», and exits 1 if any check failed. Prints no personal data
# and no secrets: the publishable key it reads from by-host is public by design and is not echoed.
set -uo pipefail

MODE=live
WITH_SSH=0
for arg in "$@"; do
  case "$arg" in
    --stand) MODE=stand ;;
    --ssh) WITH_SSH=1 ;;
    *) echo "usage: $0 [--stand] [--ssh]" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = stand ]; then
  BASE="${SMOKE_BASE:-http://cherkashino-ru.localhost:8700}"
  API="${SMOKE_API:-http://localhost:9700}"
  HOST="${SMOKE_HOST:-cherkashino-ru.localhost}"
else
  BASE="${SMOKE_BASE:-https://cherkashino.ru}"
  API="${SMOKE_API:-https://api.cherkashino.ru}"
  HOST="${SMOKE_HOST:-cherkashino.ru}"
fi
SSH_TARGET="${SMOKE_SSH:-root@201.34.137.28}"
SSH_OPTS=(-i "$HOME/.ssh/id_ed25519_do" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok()   { printf 'OK    %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILED=1; }
json() { python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    v = eval(sys.argv[1])
    print("" if v is None else v)
except Exception:
    print("")' "$1"; }

echo "ru-smoke: mode=$MODE base=$BASE api=$API host=$HOST"

# 1. Backend health.
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$API/health" 2>/dev/null)"
[ "$code" = 200 ] && ok "1 backend /health 200" || fail "1 backend /health answered $code"

# 2. The host resolves to the Черкашино shop and its buyers sign in with Yandex ID only.
curl -sS --max-time 20 "$API/storefront/by-host?host=$HOST" -o "$WORK/by-host.json" 2>/dev/null
SHOP="$(json 'd["tenant"]["name"]' < "$WORK/by-host.json")"
PK="$(json 'd["publishable_key"]' < "$WORK/by-host.json")"
METHOD="$(json 'd["login"]["method"]' < "$WORK/by-host.json")"
YA="$(json 'd["login"]["yandex_platform_available"]' < "$WORK/by-host.json")"
[ -n "$SHOP" ] && ok "2a ${HOST} resolves to the shop «${SHOP}»" || fail "2a $HOST resolves to no shop (fallback storefront)"
[ "$METHOD" = yandex ] && ok "2b buyer login method = yandex" || fail "2b buyer login method = '${METHOD:-?}', must be yandex (rule: RU buyers sign in with Yandex ID only)"
[ "$YA" = True ] && ok "2c Yandex ID keys present on this deployment" || fail "2c yandex_platform_available = '${YA:-?}' (YANDEX_CLIENT_ID missing in the backend env)"

# 3. E-mail/password sign-in and registration are refused for this shop's buyers.
for leg in "" "/register"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/auth/customer/emailpass$leg" \
    -H 'content-type: application/json' -H "x-publishable-api-key: $PK" -H "origin: $BASE" \
    -d '{"email":"ru-smoke@upready.test","password":"ru-smoke-not-a-password"}' 2>/dev/null)"
  [ "$code" = 401 ] && ok "3 emailpass$leg refused (401)" || fail "3 emailpass$leg answered $code, must be 401"
done

# 4. The Yandex button leads to Yandex with this host's own callback.
curl -sS -o /dev/null -D "$WORK/ya.hdr" --max-time 20 "$BASE/api/yandex-login" 2>/dev/null
LOC="$(tr -d '\r' < "$WORK/ya.hdr" | sed -n 's/^[Ll]ocation: //p' | head -1)"
WANT_CB="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1] + "/api/yandex-callback", safe=""))' "$BASE")"
case "$LOC" in
  https://oauth.yandex.ru/authorize*redirect_uri="$WANT_CB"*) ok "4 /api/yandex-login → oauth.yandex.ru with redirect_uri $BASE/api/yandex-callback" ;;
  *) fail "4 /api/yandex-login does not lead to oauth.yandex.ru with this host's callback (location: ${LOC%%\?*})" ;;
esac

# 5. The home page is the shop itself, on this host (no redirect to another domain).
out="$(curl -sS -o "$WORK/home.html" -w '%{http_code} %{redirect_url}' --max-time 60 "$BASE/ru" 2>/dev/null)"
code="${out%% *}"
if [ "$code" = 200 ] && [ -n "$SHOP" ] && grep -q "$SHOP" "$WORK/home.html"; then
  ok "5 $BASE/ru 200 with the shop name"
else
  fail "5 $BASE/ru answered '$out' or lacks the shop name"
fi

# 6. Product pictures load through next/image (the API host is in images.remotePatterns).
NI="$(grep -oE '/_next/image\?url=[^"&[:space:]]+' "$WORK/home.html" | head -1)"
if [ -z "$NI" ]; then
  fail "6 no next/image picture on the home page"
else
  out="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 60 "$BASE$NI&w=640&q=75" 2>/dev/null)"
  case "$out" in 200\ image/*) ok "6 next/image picture 200 ($out)" ;; *) fail "6 next/image picture answered '$out' (host not in images.remotePatterns?)" ;; esac
fi

# 7. A picture straight from the API's /static (banners use plain <img>).
API_HOST="${API#*://}"
DIRECT="$(grep -oE "https?://$API_HOST/static/[^\"'[:space:]]+\.(webp|png|jpe?g)" "$WORK/home.html" | head -1)"
if [ -z "$DIRECT" ]; then
  echo "SKIP  7 no direct /static picture on the home page"
else
  out="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 60 "$DIRECT" 2>/dev/null)"
  case "$out" in 200\ image/*) ok "7 /static picture 200 ($out)" ;; *) fail "7 /static picture answered '$out'" ;; esac
fi

# 8. The account page offers Yandex ID and no e-mail/password form.
code="$(curl -sS -o "$WORK/account.html" -w '%{http_code}' --max-time 60 "$BASE/ru/account" 2>/dev/null)"
if [ "$code" != 200 ]; then
  fail "8 /ru/account answered $code"
elif ! grep -q 'href="/api/yandex-login' "$WORK/account.html"; then
  fail "8 /ru/account has no Yandex ID block"
elif grep -qE 'data-testid="(email-input|password-input|sign-in-button)"' "$WORK/account.html"; then
  fail "8 /ru/account still shows the e-mail/password form"
else
  ok "8 /ru/account: Yandex ID only"
fi

# 9. Host checks (live RU only, --ssh): Robokassa still in test mode, nightly backups alive.
if [ "$WITH_SSH" = 1 ] && [ "$MODE" = live ]; then
  RK="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash /opt/upready-store/sql-ru.sh \"select is_test::text||'/'||is_enabled::text from tenant_integration_secret where provider='robokassa' and deleted_at is null\"" 2>/dev/null | grep -oE '(true|false)/(true|false)' | head -1)"
  case "$RK" in
    true/*) ok "9a Robokassa is_test=true (enabled=${RK#*/})" ;;
    "") echo "SKIP  9a no Robokassa row on the host" ;;
    *) fail "9a Robokassa is_test/is_enabled = $RK — live payments must stay off until Ivan says otherwise" ;;
  esac
  BK="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'systemctl is-active mt-backup.timer; f=$(ls -t /opt/upready-store/backups/mt/ru-db-*.dump 2>/dev/null | head -1); [ -n "$f" ] && echo $(( ($(date +%s) - $(stat -c %Y "$f")) / 3600 ))' 2>/dev/null | tr '\n' ' ')"
  set -- $BK
  [ "${1:-}" = active ] && ok "9b mt-backup.timer active" || fail "9b mt-backup.timer is '${1:-?}'"
  if [ -n "${2:-}" ] && [ "$2" -le 26 ]; then ok "9c newest RU dump is ${2} h old"; else fail "9c newest RU dump is '${2:-none}' h old (must be ≤ 26)"; fi
fi

[ "$FAILED" = 0 ] && echo "ru-smoke: all checks passed" || echo "ru-smoke: FAILED — see the lines above"
exit "$FAILED"
