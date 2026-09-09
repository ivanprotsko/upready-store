#!/usr/bin/env bash
# deploy/scripts/deploy-stand.sh — runs deploy/README.md's runbook for ONE stand,
# from this machine, end to end: rsync → media check → backend image → (optional
# fresh database) → backend up and healthy → publishable key into both env copies
# → storefront image → storefront up → public verification from this machine.
#
# Usage:
#   deploy/scripts/deploy-stand.sh <stand> [flags]
#     <stand>                     kerbstone | ferrite | scruple | larchant | long-morning
#     --fresh-db                  pg_dump the current database to the host's backups
#                                 dir, then `down -v` so the next boot seeds from
#                                 scratch (pickup points only seed on a fresh store)
#     --backend-image-from <s>    `docker tag <s>-backend:latest <stand>-backend:latest`
#                                 instead of building (backend images are identical
#                                 builds; only the storefront bakes per-stand values)
#     --skip-backend-build        reuse the <stand>-backend:latest already on the host
#     --skip-storefront-build     reuse <stand>-storefront:latest (unless the key changed)
#     --verify-only               run only the public checks
#
# Everything is logged to $DEPLOY_LOG_DIR (default <repo>/.ai/deploy-logs/<stand>-<ts>.log).
# No secret is ever printed: keys are reported by length and prefix only.
set -euo pipefail

STAND="${1:-}"
[ -n "$STAND" ] || { sed -n '2,20p' "$0"; exit 2; }
shift
FRESH_DB=0; BACKEND_FROM=""; SKIP_BE=0; SKIP_SF=0; VERIFY_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --fresh-db) FRESH_DB=1 ;;
    --backend-image-from) BACKEND_FROM="$2"; shift ;;
    --skip-backend-build) SKIP_BE=1 ;;
    --skip-storefront-build) SKIP_SF=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/stands/$STAND.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy the .example and fill it, README step 3)" >&2; exit 2; }
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }
PROFILE="$(envval PROFILE)"; DOMAIN="$(envval DOMAIN)"; API_DOMAIN="$(envval API_DOMAIN)"; STORE_NAME="$(envval STORE_NAME)"
DB_NAME="$(envval DB_NAME)"; DB_NAME="${DB_NAME:-medusa_$STAND}"
for v in PROFILE DOMAIN API_DOMAIN STORE_NAME; do [ -n "${!v}" ] || { echo "$v is empty in $ENV_FILE" >&2; exit 2; }; done

IP="${CONTABO_SERVER_IP:-$(grep '^CONTABO_SERVER_IP=' "$HOME/upready/.env.keys" | cut -d= -f2)}"
[ -n "$IP" ] || { echo "CONTABO_SERVER_IP not found" >&2; exit 2; }
SSH_KEY="$HOME/.ssh/id_ed25519_contabo"
HOST="root@$IP"
REMOTE_DIR="/opt/upready-store/$STAND"
REMOTE_ENV="$REMOTE_DIR/deploy/stands/$STAND.env"
COMPOSE="docker compose -p $STAND -f $REMOTE_DIR/deploy/compose.stand.yml --env-file $REMOTE_ENV"

LOG_DIR="${DEPLOY_LOG_DIR:-$REPO_ROOT/.ai/deploy-logs}"; mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/$STAND-$TS.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%H:%M:%S')] [$STAND] $*"; }
rssh() { ssh -n -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -i "$SSH_KEY" "$HOST" "$@"; }
fail() { log "FAILED: $*"; exit 1; }

log "start · profile=$PROFILE domain=$DOMAIN api=$API_DOMAIN db=$DB_NAME log=$LOG"

# ---------------------------------------------------------------- wait helpers
wait_build() { # <remote log> <deadline s>
  local f="$1" dl="$2" start; start=$(date +%s)
  while :; do
    local last; last="$(rssh "tail -1 '$f' 2>/dev/null || true")"
    if printf '%s' "$last" | grep -qE 'Built *$'; then log "build finished: $last"; return 0; fi
    if rssh "grep -qE '^ERROR|failed to solve|error: failed|exit code: [1-9]' '$f' 2>/dev/null"; then
      log "build FAILED, last 40 lines of $f:"; rssh "tail -40 '$f'"; return 1
    fi
    if [ $(( $(date +%s) - start )) -gt "$dl" ]; then log "build TIMEOUT after ${dl}s, tail of $f:"; rssh "tail -20 '$f'"; return 1; fi
    sleep 20
  done
}
wait_healthy() { # <container> <deadline s>
  local c="$1" dl="$2" start; start=$(date +%s)
  while :; do
    local st; st="$(rssh "docker inspect $c --format '{{.State.Health.Status}}|{{.RestartCount}}|{{.State.Status}}' 2>/dev/null || echo missing")"
    case "$st" in
      healthy\|0\|running) log "$c: $st"; return 0 ;;
      unhealthy\|*|*\|[1-9]*\|*|*\|exited|*\|dead)
        log "$c: $st — crash loop or unhealthy; log excerpt:"
        rssh "docker logs --tail 200 $c 2>&1 | grep -E '\[entrypoint\]|ensure-accounts|seed|Error|error|not found|ECONN' | tail -30"
        return 1 ;;
    esac
    if [ $(( $(date +%s) - start )) -gt "$dl" ]; then log "$c: TIMEOUT ($st); last log lines:"; rssh "docker logs --tail 30 $c 2>&1"; return 1; fi
    sleep 20
  done
}
md5_local() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }
env_digests_match() {
  local l r; l="$(md5_local "$ENV_FILE")"; r="$(rssh "md5sum '$REMOTE_ENV' | cut -d' ' -f1")"
  [ "$l" = "$r" ] && { log "env digests match ($l)"; return 0; }
  log "env digests DIFFER local=$l host=$r"; return 1
}

# ------------------------------------------------------------------- steps
step_rsync() {
  log "rsync worktree → $HOST:$REMOTE_DIR/"
  rssh "mkdir -p '$REMOTE_DIR'"
  rsync -az --delete \
    --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.ai' \
    --exclude '.turbo' --exclude 'dist' --exclude '.medusa' --exclude '.next-smoke' \
    -e "ssh -o BatchMode=yes -i $SSH_KEY" \
    "$REPO_ROOT/" "$HOST:$REMOTE_DIR/"
  rssh "chmod 600 $REMOTE_DIR/deploy/stands/*.env"
  env_digests_match || fail "env file drifted during rsync"
}
step_media() {
  local n; n="$(rssh "ls /opt/upready-store/media/$PROFILE 2>/dev/null | wc -l")"
  if [ "${n:-0}" -gt 0 ]; then log "media on host: $n files in /opt/upready-store/media/$PROFILE"; return 0; fi
  log "media missing on host — running deploy/scripts/sync-media.sh $PROFILE"
  CONTABO_SERVER_IP="$IP" "$REPO_ROOT/deploy/scripts/sync-media.sh" "$PROFILE"
  n="$(rssh "ls /opt/upready-store/media/$PROFILE 2>/dev/null | wc -l")"
  [ "${n:-0}" -gt 0 ] || fail "media still empty after sync"
}
step_backend_image() {
  if [ -n "$BACKEND_FROM" ]; then
    log "tagging $BACKEND_FROM-backend:latest → $STAND-backend:latest"
    rssh "docker image inspect $BACKEND_FROM-backend:latest >/dev/null && docker tag $BACKEND_FROM-backend:latest $STAND-backend:latest"
    return 0
  fi
  if [ "$SKIP_BE" = 1 ]; then rssh "docker image inspect $STAND-backend:latest >/dev/null" || fail "no $STAND-backend:latest on host"; log "reusing $STAND-backend:latest"; return 0; fi
  local f="/opt/upready-store/$STAND-build-backend-$TS.log"
  log "building backend image detached on the host, log $f"
  rssh "cd '$REMOTE_DIR' && setsid nohup $COMPOSE build backend > '$f' 2>&1 < /dev/null &"
  wait_build "$f" 1800 || fail "backend build"
}
step_fresh_db() {
  [ "$FRESH_DB" = 1 ] || return 0
  if rssh "docker inspect $STAND-postgres >/dev/null 2>&1"; then
    local b="/opt/upready-store/backups/$STAND-$TS.sql.gz"
    log "backing up $DB_NAME → $b before dropping the volume"
    rssh "mkdir -p /opt/upready-store/backups && docker exec $STAND-postgres pg_dump -U medusa -d $DB_NAME | gzip > '$b' && ls -la '$b'"
  else
    log "no $STAND-postgres container — nothing to back up"
  fi
  log "down -v (this stand's own volume only)"
  rssh "cd '$REMOTE_DIR' && $COMPOSE down -v 2>&1 | tail -5"
  rssh "docker volume ls -q | grep -c '^${STAND}_db-data\$' || true" | grep -q '^0$' || fail "volume ${STAND}_db-data still present"
}
step_backend_up() {
  log "up -d --no-build postgres backend"
  rssh "cd '$REMOTE_DIR' && $COMPOSE up -d --no-build postgres backend 2>&1 | tail -5"
  wait_healthy "$STAND-backend" 900 || fail "backend never became healthy"
  rssh "docker logs $STAND-backend 2>&1 | grep -E 'ensure-accounts:|seed-storefront-settings:|Server is ready' | tail -6"
}
step_key() {
  local key; key="$(rssh "docker exec $STAND-postgres psql -U medusa -d $DB_NAME -tAc \"SELECT token FROM api_key WHERE title = '$STORE_NAME Publishable API Key' AND type = 'publishable' ORDER BY created_at DESC LIMIT 1;\"" | tr -d '[:space:]')"
  [ -n "$key" ] || fail "no publishable key titled '$STORE_NAME Publishable API Key' in $DB_NAME"
  local cur; cur="$(envval MEDUSA_PUBLISHABLE_KEY)"
  log "publishable key in db: ${key:0:7}… (${#key} chars); env has ${#cur} chars"
  KEY_CHANGED=0
  if [ "$key" != "$cur" ]; then
    KEY_CHANGED=1
    log "writing the key into the worktree env file and the host copy"
    KEYV="$key" perl -pi -e 's/^MEDUSA_PUBLISHABLE_KEY=.*$/MEDUSA_PUBLISHABLE_KEY=$ENV{KEYV}/' "$ENV_FILE"
    grep -qE "^MEDUSA_PUBLISHABLE_KEY=$key\$" "$ENV_FILE" || fail "key did not land in $ENV_FILE"
    scp -q -o BatchMode=yes -i "$SSH_KEY" "$ENV_FILE" "$HOST:$REMOTE_ENV"
    rssh "chmod 600 '$REMOTE_ENV'"
    env_digests_match || fail "env copies differ after writing the key"
  fi
  PUB_KEY="$key"
}
step_storefront() {
  if [ "$SKIP_SF" = 1 ] && [ "${KEY_CHANGED:-0}" = 0 ]; then
    log "reusing $STAND-storefront:latest"
  else
    local f="/opt/upready-store/$STAND-build-storefront-$TS.log"
    log "building storefront image detached on the host, log $f"
    rssh "cd '$REMOTE_DIR' && setsid nohup $COMPOSE build storefront > '$f' 2>&1 < /dev/null &"
    wait_build "$f" 1800 || fail "storefront build"
  fi
  log "up -d --no-build storefront"
  rssh "cd '$REMOTE_DIR' && $COMPOSE up -d --no-build storefront 2>&1 | tail -3"
  wait_healthy "$STAND-storefront" 600 || fail "storefront never became healthy"
}

# ------------------------------------------------------------------ verify
FAILS=0
check() { # <label> <expected> <actual>
  if [ "$2" = "$3" ]; then log "ok   $1 → $3"; else log "FAIL $1 → $3 (expected $2)"; FAILS=$((FAILS+1)); fi
}
urldecode() { printf '%b' "${1//%/\\x}"; }
# A login right after a cold start can answer 502 (traefik) or 400 once while the
# backend warms up (measured on kerbstone 2026-09-10: 400, 502, then 200 200 200).
# Three attempts, and the attempt count is part of the reported value.
post_code_retry() { # <url> <json body>  -> "<code>" or "<code> after N tries"
  local url="$1" body="$2" i code
  for i in 1 2 3; do
    code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST "$url" -H 'Content-Type: application/json' -d "$body" || echo 000)"
    if [ "$code" = 200 ]; then [ "$i" = 1 ] && echo "$code" || echo "$code (after $i tries)"; return 0; fi
    sleep 5
  done
  echo "$code"
}
check_login() { # <label> <url> <json body>
  local got; got="$(post_code_retry "$2" "$3")"
  if [ "${got%% *}" = 200 ]; then log "ok   $1 → $got"; else log "FAIL $1 → $got (expected 200)"; FAILS=$((FAILS+1)); fi
}
step_verify() {
  local html; html="$(mktemp)"
  local code; code="$(curl -sS -m 60 -o "$html" -w '%{http_code} tls=%{ssl_verify_result}' "https://$DOMAIN/en" || echo "000 tls=err")"
  check "GET https://$DOMAIN/en" "200 tls=0" "$code"
  check "GET https://$API_DOMAIN/health" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$API_DOMAIN/health" || echo 000)"
  check_login "POST /auth/user/emailpass $(envval MEDUSA_ADMIN_EMAIL)" "https://$API_DOMAIN/auth/user/emailpass" "{\"email\":\"$(envval MEDUSA_ADMIN_EMAIL)\",\"password\":\"$(envval MEDUSA_ADMIN_PASSWORD)\"}"
  check_login "POST /auth/customer/emailpass $(envval DEMO_CUSTOMER_EMAIL)" "https://$API_DOMAIN/auth/customer/emailpass" "{\"email\":\"$(envval DEMO_CUSTOMER_EMAIL)\",\"password\":\"$(envval DEMO_CUSTOMER_PASSWORD)\"}"
  check "POST /api/devtools/unlock (wrong password)" "401" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/devtools/unlock" -H 'Content-Type: application/json' -d '{"password":"definitely-wrong"}' || echo 000)"
  check "POST /api/devtools/unlock (panel password)" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/devtools/unlock" -H 'Content-Type: application/json' -d "{\"password\":\"$(envval STOREFRONT_DEVTOOLS_PASSWORD)\"}" || echo 000)"
  # Hero: the served HTML references the image only for hero variants that carry one
  # (kerbstone's seeded composition is K = announcement band, no image — decision F9),
  # so the media pipeline is proven two ways: the profile's own hero file on the API
  # host, and the profile the image BAKED (stand one shipped localhost:9023 there).
  local layout; layout="$(grep -oE 'data-hero-layout="[a-z-]+"' "$html" | head -1 | cut -d'"' -f2 || true)"
  log "hero layout served: ${layout:-none}"
  local enc; enc="$(grep -oE 'url=[^&"]*home-hero\.webp' "$html" | head -1 | cut -d= -f2- || true)"
  local hero; hero="$(urldecode "$enc")"
  if [ -n "$hero" ]; then
    log "hero src in HTML: $hero"
    case "$hero" in https://$API_DOMAIN/*) ;; *) log "FAIL hero src is not on https://$API_DOMAIN"; FAILS=$((FAILS+1)) ;; esac
    check "GET hero (raw)" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$hero" || echo 000)"
    check "GET hero via /_next/image" "200" "$(curl -sS -m 60 -o /dev/null -w '%{http_code}' "https://$DOMAIN/_next/image?url=$enc&w=1920&q=70" || echo 000)"
  else
    log "no hero image in the HTML (layout ${layout:-none}); checking the profile hero file and the baked profile instead"
  fi
  local pj="$REPO_ROOT/apps/backend/src/migration-scripts/data/profiles/$PROFILE/profile.json"
  local heroref; heroref="$(node -e 'const p=require(process.argv[1]);console.log((p.home?.hero?.image||"").replace(/^media\//,""))' "$pj")"
  [ -n "$heroref" ] && check "GET profile hero $heroref" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$API_DOMAIN/static/store-profiles/$PROFILE/$heroref" || echo 000)"
  local baked; baked="$(rssh "docker exec $STAND-storefront sh -c 'f=apps/storefront/src/lib/profile/profile.generated.json; printf \"localhost=%s api=%s\" \$(grep -c localhost \$f) \$(grep -c $API_DOMAIN \$f)'" 2>/dev/null || echo 'unreadable')"
  local bakedOk="no"; case "$baked" in localhost=0\ api=[1-9]*) bakedOk="yes" ;; esac
  check "baked profile.generated.json points at $API_DOMAIN (localhost=0) [$baked]" "yes" "$bakedOk"
  # Category tiles: the composition may switch them off (kerbstone seeds tiles=off), so
  # the HTML is not the only source — every tile the profile authors must be served too.
  local tiles; tiles="$(grep -oE 'url=[^&"]*tile-[a-z0-9-]+\.webp' "$html" | cut -d= -f2- | sort -u || true)"
  local t n=0
  for t in $tiles; do n=$((n+1)); t="$(urldecode "$t")"; check "GET tile in HTML $(basename "$t")" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$t" || echo 000)"; done
  log "category tiles referenced by the HTML: $n"
  local pj="$REPO_ROOT/apps/backend/src/migration-scripts/data/profiles/$PROFILE/profile.json"
  local ref
  for ref in $(node -e 'const p=require(process.argv[1]);for(const t of (p.home?.categoryTiles||[]))if(t.image)console.log(t.image.replace(/^media\//,""))' "$pj"); do
    check "GET profile tile $ref" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$API_DOMAIN/static/store-profiles/$PROFILE/$ref" || echo 000)"
  done
  # pickup points through the store API with this stand's publishable key
  local key; key="${PUB_KEY:-$(envval MEDUSA_PUBLISHABLE_KEY)}"
  local pp; pp="$(curl -sS -m 30 "https://$API_DOMAIN/store/pickup-points" -H "x-publishable-api-key: $key" || echo '{}')"
  local cnt; cnt="$(printf '%s' "$pp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.pickup_points||[]).length)}catch(e){console.log("parse-error")}})')"
  check "GET /store/pickup-points count" "4" "$cnt"
  rm -f "$html"
  if [ "$FAILS" = 0 ]; then log "VERIFY OK — every check passed"; else log "VERIFY FAILED — $FAILS check(s) red"; return 1; fi
}

# -------------------------------------------------------------------- main
if [ "$VERIFY_ONLY" = 1 ]; then step_verify; exit $?; fi
step_rsync
step_media
step_backend_image
step_fresh_db
step_backend_up
step_key
step_storefront
step_verify
log "DONE"
