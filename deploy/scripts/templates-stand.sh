#!/usr/bin/env bash
# deploy/scripts/templates-stand.sh — (re)builds the templates stand,
# https://templates.store.upready.dev (t-2026-10-12-33), from the current `templates/main`:
# export the branch → rsync to the host → env file from kerbstone's → wait for the CI
# runner to be idle → storefront image, built detached, memory watched → up → checks from
# this machine.
#
# Usage:
#   deploy/scripts/templates-stand.sh [flags]
#     --ref <git ref>         build this instead of origin/templates/main (fetched first)
#     --skip-build            reuse the image already tagged with the ref's sha
#     --verify-only           run only the public checks
#     --runner-wait <min>     how long to wait for the runner's job to end (default 30)
#
# One storefront over kerbstone's backend (deploy/compose.templates.yml on top of
# deploy/compose.stand.yml): no postgres, no backend, no database of its own. The env file
# is written ON THE HOST from kerbstone's, every run, so no secret crosses this machine; the
# panel (studio) is off there, so the stand cannot write kerbstone's composition.
#
# Exit: 0 every check green; 1 a step or a check failed; 3 blocked — host memory under
# MEM_FLOOR_MB during the build (the build is stopped) or the runner stayed busy.
# Take it down (keeps the images):
#   ssh root@<host> 'cd /opt/upready-store/templates && docker compose -p templates \
#     -f deploy/compose.stand.yml -f deploy/compose.templates.yml \
#     --env-file deploy/stands/templates.env down'
set -euo pipefail

REF="origin/templates/main"; SKIP_BUILD=0; VERIFY_ONLY=0; RUNNER_WAIT_MIN=30
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift ;;
    --skip-build) SKIP_BUILD=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    --runner-wait) RUNNER_WAIT_MIN="$2"; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

STAND=templates
DOMAIN=templates.store.upready.dev
SOURCE_STAND=kerbstone
# Measured 12.10.2026: a storefront `next build` is the host's memory peak; under this
# much available the build is stopped and the run ends blocked (code 3).
MEM_FLOOR_MB="${MEM_FLOOR_MB:-1536}"
# Not started under this much: leaves the build its peak before the floor is reached.
MEM_START_MB="${MEM_START_MB:-3072}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IP="${CONTABO_SERVER_IP:-84.46.251.149}"
SSH_KEY="$HOME/.ssh/id_ed25519_contabo"
HOST="root@$IP"
REMOTE_DIR="/opt/upready-store/$STAND"
REMOTE_ENV="$REMOTE_DIR/deploy/stands/$STAND.env"
SOURCE_ENV="/opt/upready-store/$SOURCE_STAND/deploy/stands/$SOURCE_STAND.env"
COMPOSE="docker compose -p $STAND -f $REMOTE_DIR/deploy/compose.stand.yml -f $REMOTE_DIR/deploy/compose.templates.yml --env-file $REMOTE_ENV"

LOG_DIR="${DEPLOY_LOG_DIR:-$REPO_ROOT/.ai/deploy-logs}"; mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/$STAND-$TS.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%H:%M:%S')] [$STAND] $*"; }
rssh() { ssh -n -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -i "$SSH_KEY" "$HOST" "$@"; }
# A script on stdin, arguments after it: the host runs it, nothing is quoted twice.
rsh() { ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -i "$SSH_KEY" "$HOST" bash -s -- "$@"; }
fail() { log "FAILED: $*"; exit 1; }
blocked() { log "BLOCKED: $*"; exit 3; }
mem_available() { rssh "awk '/MemAvailable/ {print int(\$2/1024)}' /proc/meminfo"; }
# The runner's job runs as Runner.Worker on the host; the listener alone is an idle runner.
runner_busy() { rssh "ps -eo args | grep -c '[R]unner.Worker' || true"; }

log "start · ref=$REF log=$LOG"

# ------------------------------------------------------------------- steps
step_source() {
  git -C "$REPO_ROOT" fetch -q origin templates/main
  SHA="$(git -C "$REPO_ROOT" rev-parse --short=8 "$REF^{commit}")"
  log "source $REF = $SHA ($(git -C "$REPO_ROOT" log -1 --format=%s "$SHA" | cut -c1-90))"
  local tmp; tmp="$(mktemp -d)"
  # The image is built from apps/, specs/ and the root manifests; handoff/, artifacts/ and
  # docs/ are three quarters of the tree's 257 MB and none of them reach the image.
  git -C "$REPO_ROOT" archive --format=tar "$SHA" -- . \
    ':(exclude)handoff' ':(exclude)artifacts' ':(exclude)docs' | tar -x -C "$tmp"
  echo "$SHA" > "$tmp/.stand-revision"
  log "rsync $REF → $HOST:$REMOTE_DIR/"
  rssh "mkdir -p '$REMOTE_DIR/deploy/stands'"
  # The env file lives in the tree but is written on the host: excluded, so --delete keeps it.
  rsync -az --delete --exclude "deploy/stands/$STAND.env" \
    -e "ssh -o BatchMode=yes -i $SSH_KEY" "$tmp/" "$HOST:$REMOTE_DIR/"
  rm -rf "$tmp"
}

step_env() {
  log "env file from $SOURCE_ENV (values never printed)"
  rsh "$SOURCE_ENV" "$REMOTE_ENV" "$STAND" "$DOMAIN" "$SHA" <<'REMOTE'
set -euo pipefail
src="$1"; dst="$2"; stand="$3"; domain="$4"; sha="$5"
[ -r "$src" ] || { echo "no $src on the host" >&2; exit 1; }
get() { grep -E "^$1=" "$src" | head -1 | cut -d= -f2-; }
# Kept across runs: rotating it buys nothing, nobody calls this stand's revalidate route.
reval="$(grep -E '^REVALIDATE_SECRET=' "$dst" 2>/dev/null | cut -d= -f2- || true)"
reval="${reval:-$(openssl rand -hex 32)}"
umask 077
{
  echo "# Written by deploy/scripts/templates-stand.sh on every run from $src; edit the script."
  echo "STAND=$stand"
  echo "COMPOSE_PROJECT_NAME=$stand"
  echo "DOMAIN=$domain"
  echo "IMAGE_TAG=$sha"
  for k in PROFILE API_DOMAIN STORE_NAME MEDUSA_PUBLISHABLE_KEY DEFAULT_REGION STOREFRONT_DEFAULT_LOCALE GEOLOCATION_PROVIDER GEOLOCATION_PROVIDER_API_KEY; do
    echo "$k=$(get "$k")"
  done
  echo "REVALIDATE_SECRET=$reval"
  # Empty: the panel answers 404 and nothing is saved into kerbstone's composition.
  echo "STOREFRONT_STUDIO_PASSWORD="
  echo "STOREFRONT_SETTINGS_SECRET="
  echo "GA_MEASUREMENT_ID="
  # Read only by compose.stand.yml's postgres and backend, which this stand does not run.
  for k in POSTGRES_PASSWORD JWT_SECRET COOKIE_SECRET INTEGRATION_ENCRYPTION_KEY; do echo "$k="; done
} > "$dst.tmp"
mv "$dst.tmp" "$dst"
chmod 600 "$dst"
for k in PROFILE API_DOMAIN STORE_NAME MEDUSA_PUBLISHABLE_KEY; do
  v="$(grep -E "^$k=" "$dst" | cut -d= -f2-)"
  [ -n "$v" ] || { echo "$k is empty in $dst" >&2; exit 1; }
done
key="$(grep -E '^MEDUSA_PUBLISHABLE_KEY=' "$dst" | cut -d= -f2-)"
echo "env: $(grep -E '^(PROFILE|API_DOMAIN|STORE_NAME|DEFAULT_REGION|IMAGE_TAG)=' "$dst" | tr '\n' ' ')key=${key:0:7}… (${#key} chars)"
REMOTE
}

step_wait_runner() {
  # A workflow's jobs follow each other 2-3 s apart (the runner's log, 12.10.2026), so one
  # empty look is usually the gap between two jobs, not the end of the queue: idle means
  # no job on two looks 30 s apart. Waiting is logged when it starts and every 10 minutes.
  local start idle=0 said=0; start=$(date +%s)
  while :; do
    if [ "$(runner_busy)" = 0 ]; then
      idle=$((idle + 1)); [ "$idle" -ge 2 ] && break
    else
      idle=0
      if [ $(( $(date +%s) - said )) -ge 600 ]; then
        log "the CI runner is running a job; waiting (a storefront build next to it is the host's memory peak)"
        said=$(date +%s)
      fi
    fi
    if [ $(( $(date +%s) - start )) -gt $(( RUNNER_WAIT_MIN * 60 )) ]; then
      blocked "the CI runner on the host is still running jobs after ${RUNNER_WAIT_MIN} min"
    fi
    sleep 30
  done
  log "the CI runner is idle (no job on two looks 30 s apart, after $(( ($(date +%s) - start) / 60 )) min)"
}

step_build() {
  if [ "$SKIP_BUILD" = 1 ]; then
    rssh "docker image inspect $STAND-storefront:$SHA >/dev/null" || fail "no $STAND-storefront:$SHA on the host"
    log "reusing $STAND-storefront:$SHA"
    return 0
  fi
  step_wait_runner
  local mem; mem="$(mem_available)"
  [ "$mem" -ge "$MEM_START_MB" ] || blocked "${mem} MB available on the host, under ${MEM_START_MB} MB: not starting a build"
  local f="/opt/upready-store/$STAND-build-storefront-$TS.log" p="/opt/upready-store/$STAND-build-storefront.pid"
  log "building $STAND-storefront:$SHA detached on the host (${mem} MB available), log $f"
  rssh "cd '$REMOTE_DIR' && setsid nohup $COMPOSE build storefront > '$f' 2>&1 < /dev/null & echo \$! > '$p'"
  local start low=$mem; start=$(date +%s)
  while :; do
    sleep 15
    mem="$(mem_available)"; [ "$mem" -lt "$low" ] && low=$mem
    if [ "$mem" -lt "$MEM_FLOOR_MB" ]; then
      rssh "kill \$(cat '$p') 2>/dev/null || true"
      blocked "${mem} MB available on the host during the build, under ${MEM_FLOOR_MB} MB: build stopped, log $f"
    fi
    local last; last="$(rssh "tail -1 '$f' 2>/dev/null || true")"
    if printf '%s' "$last" | grep -qE 'Built *$'; then log "build finished in $(( $(date +%s) - start ))s, lowest available ${low} MB"; break; fi
    if rssh "grep -qE '^ERROR|failed to solve|error: failed|exit code: [1-9]' '$f' 2>/dev/null"; then
      log "build FAILED, last 40 lines of $f:"; rssh "tail -40 '$f'"; exit 1
    fi
    if [ $(( $(date +%s) - start )) -gt 1800 ]; then log "build TIMEOUT, tail of $f:"; rssh "tail -20 '$f'"; exit 1; fi
  done
}

step_up() {
  log "up -d --no-deps --no-build storefront"
  rssh "cd '$REMOTE_DIR' && $COMPOSE up -d --no-deps --no-build storefront 2>&1 | tail -3"
  local start st; start=$(date +%s)
  while :; do
    st="$(rssh "docker inspect $STAND-storefront --format '{{.State.Health.Status}}|{{.RestartCount}}|{{.State.Status}}' 2>/dev/null || echo missing")"
    case "$st" in
      healthy\|0\|running) log "$STAND-storefront: $st"; break ;;
      unhealthy\|*|*\|[1-9]*\|*|*\|exited|*\|dead) log "$STAND-storefront: $st"; rssh "docker logs --tail 40 $STAND-storefront 2>&1"; exit 1 ;;
    esac
    [ $(( $(date +%s) - start )) -gt 600 ] && { log "TIMEOUT ($st)"; rssh "docker logs --tail 40 $STAND-storefront 2>&1"; exit 1; }
    sleep 10
  done
  # Nothing else under -p templates: compose.templates.yml resets depends_on, and --no-deps.
  local others; others="$(rssh "docker ps -a --filter label=com.docker.compose.project=$STAND --format '{{.Names}}' | grep -vx $STAND-storefront || true")"
  [ -z "$others" ] || fail "more than the storefront under -p $STAND: $others"
}

# ------------------------------------------------------------------ verify
FAILS=0
check() { # <label> <expected> <actual>
  if [ "$2" = "$3" ]; then log "ok   $1 → $3"; else log "FAIL $1 → $3 (expected $2)"; FAILS=$((FAILS+1)); fi
}
theme_of() { # <path> → data-theme on <html>
  curl -sS -m 60 -L "https://$DOMAIN$1" | grep -oE '<html[^>]*' | grep -oE 'data-theme="[^"]*"' | head -1 | cut -d'"' -f2
}
step_verify() {
  check "GET https://$DOMAIN/ (redirects followed)" "200 tls=0" \
    "$(curl -sS -m 60 -L -o /dev/null -w '%{http_code} tls=%{ssl_verify_result}' "https://$DOMAIN/" || echo "000 tls=err")"
  check "GET http://$DOMAIN/ redirects to https" "https://$DOMAIN/" \
    "$(curl -sS -m 30 -o /dev/null -w '%{redirect_url}' "http://$DOMAIN/" || echo err)"
  check "X-Robots-Tag on /en" "noindex, nofollow" \
    "$(curl -sS -m 60 -o /dev/null -D - "https://$DOMAIN/en" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-robots-tag"{print $2}' | head -1)"
  check "data-theme of /en?template=long-morning" "home-goods" "$(theme_of '/en?template=long-morning')"
  check "data-theme of /en?template=ferrite" "electronics" "$(theme_of '/en?template=ferrite')"
  check "GET /ru/template-lab" "200" "$(curl -sS -m 60 -o /dev/null -w '%{http_code}' "https://$DOMAIN/ru/template-lab" || echo 000)"
  check "studio panel is off (POST /api/studio/unlock)" "404" \
    "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST "https://$DOMAIN/api/studio/unlock" -H 'Content-Type: application/json' -d '{"password":"x"}' || echo 000)"
  log "served revision: $(rssh "cat $REMOTE_DIR/.stand-revision") · image $(rssh "docker inspect $STAND-storefront --format '{{.Config.Image}}'")"
  log "memory: $(rssh "docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $STAND-storefront") · host $(mem_available) MB available"
  if [ "$FAILS" = 0 ]; then log "VERIFY OK — every check passed"; else log "VERIFY FAILED — $FAILS check(s) red"; return 1; fi
}

# -------------------------------------------------------------------- main
if [ "$VERIFY_ONLY" = 1 ]; then step_verify; exit $?; fi
step_source
step_env
step_build
step_up
step_verify
log "DONE · https://$DOMAIN serves templates/main $SHA"
