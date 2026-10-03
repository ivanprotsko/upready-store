#!/usr/bin/env bash
# deploy/scripts/deploy-instance.sh — ships ONE release ref to ONE instance's
# host, from this machine (t-2026-10-03-23 / t-cherk-25). The seven steps the
# task names, in order:
#
#   1. git archive <git-ref> -> rsync to the host (no git clone/pull on the
#      host, no SSH between the RU and INTL hosts — there is none and there
#      will not be one, docs/instances/RULES.md §4).
#   2. docker compose build on the host (images are built there, never
#      pushed from here).
#   3. instance-check.mjs against THIS instance's own profile; a violation
#      stops before anything below touches the running stack.
#   4. pg_dump the database, before this release's migrations run.
#   5. docker compose up -d --build; migrations run in docker-entrypoint.sh,
#      exactly as every other boot of this backend already does.
#   6. /health and the storefront, checked by host, from this machine.
#   7. Rollback, by the previous image tag — see --rollback below.
#
# The RELEASE ORDER lives in docs/instances/RULES.md §4, not in this script:
# a human runs `deploy-instance.sh intl <ref>` first, waits for its own step 6
# to be green, then runs `deploy-instance.sh ru <ref>`. Each instance's own
# rollback (step 7) never touches the other host.
#
# Usage:
#   deploy/scripts/deploy-instance.sh <ru|intl> <git-ref> [flags]
#     --env-file <path>          override the env file this release carries to
#                                 the host (default deploy/mt/<instance>.env).
#                                 The CURRENT Contabo (intl) deployment uses
#                                 deploy/mt/shipshift.env — pass
#                                 `--env-file deploy/mt/shipshift.env` there
#                                 until that file is renamed, which this task
#                                 does not do on a live host.
#     --skip-backend-build        reuse the image already on the host
#     --skip-storefront-build     reuse the image already on the host
#     --skip-panel-build          reuse the image already on the host
#     --skip-instance-check       escape hatch for a dry run only — never use
#                                 this against a real host; the script logs a
#                                 warning every time it is set
#     --verify-only               run only step 6
#     --rollback <image-tag>      run only step 7, against that tag
#
# Everything is logged to $DEPLOY_LOG_DIR (default <repo>/.ai/deploy-logs/
# <instance>-<ts>.log). No secret is ever printed: pg-backup.sh's own output
# already avoids that, and this script never echoes an env file's values.
set -euo pipefail

INSTANCE="${1:-}"
GIT_REF="${2:-}"
[ -n "$INSTANCE" ] && [ -n "$GIT_REF" ] || { sed -n '2,38p' "$0"; exit 2; }
shift 2

ENV_FILE_OVERRIDE=""; SKIP_BE=0; SKIP_SF=0; SKIP_PANEL=0; SKIP_CHECK=0; VERIFY_ONLY=0; ROLLBACK_TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE_OVERRIDE="$2"; shift ;;
    --skip-backend-build) SKIP_BE=1 ;;
    --skip-storefront-build) SKIP_SF=1 ;;
    --skip-panel-build) SKIP_PANEL=1 ;;
    --skip-instance-check) SKIP_CHECK=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    --rollback) ROLLBACK_TAG="$2"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE_FILE="$REPO_ROOT/deploy/instances/$INSTANCE.json"
[ -f "$PROFILE_FILE" ] || { echo "no profile at $PROFILE_FILE — instance must be ru or intl" >&2; exit 2; }

# ---------------------------------------------------------- per-instance host
# Two independent hosts, two independent credentials, no path between them
# (docs/instances/RULES.md §4). Both read from ~/upready/.env.keys the same
# way deploy/scripts/deploy-stand.sh already reads CONTABO_SERVER_IP, rather
# than hardcoding a real IP into a file this repository commits.
case "$INSTANCE" in
  intl)
    IP="${CONTABO_SERVER_IP:-$(grep '^CONTABO_SERVER_IP=' "$HOME/upready/.env.keys" 2>/dev/null | cut -d= -f2)}"
    SSH_KEY="${INTL_HOST_SSH_KEY:-$HOME/.ssh/id_ed25519_contabo}"
    BRING_UP_OWN_TRAEFIK=0
    ;;
  ru)
    IP="${RU_HOST_IP:-$(grep '^RU_HOST_IP=' "$HOME/upready/.env.keys" 2>/dev/null | cut -d= -f2)}"
    SSH_KEY="${RU_HOST_SSH_KEY:-$HOME/.ssh/id_ed25519_do}"
    BRING_UP_OWN_TRAEFIK=1
    ;;
  *) echo "instance must be ru or intl, got: $INSTANCE" >&2; exit 2 ;;
esac
[ -n "$IP" ] || { echo "no host IP for instance $INSTANCE (set CONTABO_SERVER_IP / RU_HOST_IP in ~/upready/.env.keys)" >&2; exit 2; }
HOST="root@$IP"
REMOTE_DIR="/opt/upready-store/mt"
if [ -n "$ENV_FILE_OVERRIDE" ]; then
  case "$ENV_FILE_OVERRIDE" in
    /*) ENV_FILE="$ENV_FILE_OVERRIDE" ;;
    *) ENV_FILE="$REPO_ROOT/$ENV_FILE_OVERRIDE" ;;
  esac
else
  ENV_FILE="$REPO_ROOT/deploy/mt/$INSTANCE.env"
fi
[ -f "$ENV_FILE" ] || { echo "missing env file $ENV_FILE (copy deploy/mt/shipshift.env.example, or pass --env-file)" >&2; exit 2; }
REMOTE_ENV="$REMOTE_DIR/$(basename "$ENV_FILE")"
COMPOSE="docker compose -p mt -f $REMOTE_DIR/deploy/compose.mt.yml --env-file $REMOTE_ENV"
RU_HOST_COMPOSE="docker compose -p ru-host -f $REMOTE_DIR/deploy/compose.ru-host.yml"

LOG_DIR="${DEPLOY_LOG_DIR:-$REPO_ROOT/.ai/deploy-logs}"; mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/$INSTANCE-$TS.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%H:%M:%S')] [$INSTANCE] $*"; }
rssh() { ssh -n -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -i "$SSH_KEY" "$HOST" "$@"; }
fail() { log "FAILED: $*"; exit 1; }
envval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }

log "start · instance=$INSTANCE ref=$GIT_REF host=$IP log=$LOG"

md5_local() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }
env_digests_match() {
  local l r; l="$(md5_local "$ENV_FILE")"; r="$(rssh "md5sum '$REMOTE_ENV' 2>/dev/null | cut -d' ' -f1")"
  [ -n "$r" ] && [ "$l" = "$r" ] && { log "env digests match ($l)"; return 0; }
  log "env digests DIFFER local=$l host=${r:-<missing>}"; return 1
}
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
postgres_running() { rssh "docker inspect mt-postgres >/dev/null 2>&1"; }

# ------------------------------------------------------------------- step 1
step_archive_and_rsync() {
  local workdir; workdir="$(mktemp -d)"
  log "git archive $GIT_REF -> $workdir (clean release tree, no uncommitted work, no .git)"
  # `handoff/` (the operator task registry) and `artifacts/` (design exports) are tracked but are not part
  # of any image and must not land on a production host: ~170 MB through a slow link, and internal notes.
  git -C "$REPO_ROOT" archive "$GIT_REF" -- . ':!handoff' ':!artifacts' | tar -x -C "$workdir"
  log "rsync $workdir -> $HOST:$REMOTE_DIR/"
  rssh "mkdir -p '$REMOTE_DIR'"
  rsync -az --delete \
    -e "ssh -o BatchMode=yes -i $SSH_KEY" \
    "$workdir/" "$HOST:$REMOTE_DIR/"
  rm -rf "$workdir"
  log "rsync env file $ENV_FILE -> $HOST:$REMOTE_ENV (gitignored, carried separately from the archive)"
  rsync -az -e "ssh -o BatchMode=yes -i $SSH_KEY" "$ENV_FILE" "$HOST:$REMOTE_ENV"
  rssh "chmod 600 '$REMOTE_ENV'"
  env_digests_match || fail "env file drifted during rsync"
}

# ------------------------------------------------------------------- step 2
step_build_images() {
  if [ "$BRING_UP_OWN_TRAEFIK" = 1 ]; then
    log "RU host: bringing up deploy/compose.ru-host.yml (own traefik, idempotent) before the mt stack needs the coolify network"
    rssh "cd '$REMOTE_DIR' && $RU_HOST_COMPOSE up -d 2>&1 | tail -10"
  fi
  for svc in backend storefront panel; do
    case "$svc" in
      backend) [ "$SKIP_BE" = 1 ] && { log "skip backend build"; continue; } ;;
      storefront) [ "$SKIP_SF" = 1 ] && { log "skip storefront build"; continue; } ;;
      panel) [ "$SKIP_PANEL" = 1 ] && { log "skip panel build"; continue; } ;;
    esac
    local f="/opt/upready-store/mt-build-$svc-$TS.log"
    log "building $svc image detached on the host, log $f"
    rssh "cd '$REMOTE_DIR' && setsid nohup $COMPOSE build $svc > '$f' 2>&1 < /dev/null &"
    wait_build "$f" 1800 || fail "$svc build"
  done
}

# ------------------------------------------------------------------- step 3
step_instance_check() {
  if [ "$SKIP_CHECK" = 1 ]; then
    log "WARNING: --skip-instance-check set — this instance's own allow/deny rules were not verified"
    return 0
  fi
  log "instance-check --instance $INSTANCE on the host's own env file"
  if postgres_running; then
    local pw db
    pw="$(rssh "grep '^POSTGRES_PASSWORD=' '$REMOTE_ENV' | cut -d= -f2-")"
    db="$(rssh "grep '^DB_NAME=' '$REMOTE_ENV' | cut -d= -f2-")"; db="${db:-medusa_mt}"
    log "mt-postgres is up — checking --db too (instance-check runs inside a disposable node+psql container on the coolify network, never on this machine)"
    rssh "docker run --rm --network coolify -v '$REMOTE_DIR':/repo -w /repo node:22-alpine \
      sh -c \"apk add --no-cache postgresql-client >/dev/null 2>&1 && \
      node deploy/scripts/instance-check.mjs --instance $INSTANCE --env '$(basename "$REMOTE_ENV")' --db postgres://medusa:$pw@mt-postgres:5432/$db\"" \
      || fail "instance-check found a violation (see the VIOLATION lines above) — stopping before step 4/5 touch this host"
  else
    log "mt-postgres is not running yet (first boot) — env-only check, nothing to query"
    rssh "docker run --rm -v '$REMOTE_DIR':/repo -w /repo node:22-alpine \
      node deploy/scripts/instance-check.mjs --instance $INSTANCE --env '$(basename "$REMOTE_ENV")'" \
      || fail "instance-check found a violation in the env file (see the VIOLATION lines above) — stopping before step 4/5 touch this host"
  fi
}

# ------------------------------------------------------------------- step 4
step_pre_migration_backup() {
  if ! postgres_running; then
    log "mt-postgres is not running yet (first boot) — nothing to back up before this release's migrations"
    return 0
  fi
  local db; db="$(rssh "grep '^DB_NAME=' '$REMOTE_ENV' | cut -d= -f2-")"; db="${db:-medusa_mt}"
  log "pg_dump $db before this release's migrations run (deploy/backup/pg-backup.sh, docker-exec mode)"
  rssh "cd '$REMOTE_DIR' && BACKUP_TARGET_DIR=/opt/upready-store/backups/mt \
    PG_DUMP_DOCKER_CONTAINER=mt-postgres PG_DUMP_DB_USER=medusa PG_DUMP_DB_NAME=$db \
    BACKUP_LABEL=pre-deploy-$TS deploy/backup/pg-backup.sh" \
    || fail "pre-migration backup failed — not proceeding to step 5 without one"
}

# ------------------------------------------------------------------- step 5
step_up() {
  log "up -d --build (migrations run in docker-entrypoint.sh, as on every boot)"
  rssh "cd '$REMOTE_DIR' && $COMPOSE up -d --build 2>&1 | tail -20"
}

# ------------------------------------------------------------------- step 6
FAILS=0
check() { # <label> <expected> <actual>
  if [ "$2" = "$3" ]; then log "ok   $1 → $3"; else log "FAIL $1 → $3 (expected $2)"; FAILS=$((FAILS+1)); fi
}
step_verify() {
  FAILS=0
  local engine panel stores
  engine="$(envval ENGINE_DOMAIN)"; panel="$(envval PANEL_DOMAIN)"; stores="$(envval STORES_DOMAIN)"
  check "GET https://$engine/health" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$engine/health" || echo 000)"
  [ -n "$panel" ] && check "GET https://$panel/healthz" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$panel/healthz" || echo 000)"
  for host in $(rssh "cd '$REMOTE_DIR' && docker exec mt-ingress-sync /bin/sh /usr/local/bin/tenant-ingress-sync.sh --list" 2>/dev/null); do
    check "GET https://$host/ (tenant storefront)" "200" "$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "https://$host/" || echo 000)"
  done
  [ -n "$stores" ] && log "note: $stores is the CNAME target, not a shop — it 301s to $engine by design (compose.mt.yml), not checked here as a 200"
  if [ "$FAILS" = 0 ]; then log "VERIFY OK — every check passed"; else log "VERIFY FAILED — $FAILS check(s) red"; return 1; fi
}

# ------------------------------------------------------------------- step 7
step_rollback() {
  local tag="$1"
  log "rollback: retagging every mt-* image to :$tag and restarting, no rebuild"
  for svc in backend storefront panel; do
    rssh "docker image inspect mt-$svc:$tag >/dev/null 2>&1" || { log "no mt-$svc:$tag on host — skipping that service"; continue; }
    rssh "docker tag mt-$svc:$tag mt-$svc:latest"
  done
  rssh "cd '$REMOTE_DIR' && $COMPOSE up -d --no-build 2>&1 | tail -10"
  step_verify
}

# -------------------------------------------------------------------- main
if [ -n "$ROLLBACK_TAG" ]; then step_rollback "$ROLLBACK_TAG"; exit $?; fi
if [ "$VERIFY_ONLY" = 1 ]; then step_verify; exit $?; fi
step_archive_and_rsync
step_build_images
step_instance_check
step_pre_migration_backup
step_up
step_verify
log "DONE"
