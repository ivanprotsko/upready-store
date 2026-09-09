#!/usr/bin/env bash
# Rsyncs one profile's product/hero/tile media into the host volume path the
# backend container mounts at /app/static/store-profiles/<id> (see the
# "backend" service's volumes: line in deploy/compose.stand.yml).
#
# The files themselves are gitignored (apps/backend/.gitignore, ".gitignore"
# — "media never enter git") and so never travel with the repo checkout;
# this script is how they reach the host instead, run from the machine that
# HAS them generated (a dev machine or a checkout where the store-profile
# media pipeline already ran), targeting the Contabo host over SSH.
#
# Usage:
#   deploy/scripts/sync-media.sh <profile> [--dry-run]
#
# Reads host/user/path from the environment, never hardcoded, and never
# prints SSH_KEY_PATH's contents:
#   DEPLOY_SSH_HOST   defaults to $CONTABO_SERVER_IP (source it from
#                     ~/upready/.env.keys first: this script only reads the
#                     variable NAME from the environment, never the file)
#   DEPLOY_SSH_USER   defaults to root, matching the agent-creatr precedent
#                     (~/upready/memory/agent-creatr-prod-deploy-contabo.md
#                     "Сервер root@84.46.251.149")
#   DEPLOY_SSH_KEY    path to the private key; falls back to rsync/ssh's own
#                     default identity resolution when unset
#   MEDIA_HOST_PATH   remote directory the stand's compose env file also
#                     names as MEDIA_HOST_PATH (default /opt/stands/media,
#                     matching deploy/stands/*.env.example)
#
# Safe to re-run: rsync only transfers changed files, and this script never
# deletes on the remote (no --delete) — a profile's media only grows or is
# hand-corrected, never pruned by this script.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILES_DIR="$REPO_ROOT/apps/backend/src/migration-scripts/data/profiles"

PROFILE="${1:-}"
DRY_RUN=""
if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
fi

if [[ -z "$PROFILE" ]]; then
  echo "Usage: $(basename "$0") <profile> [--dry-run]" >&2
  echo "  profile: one of sneakers, electronics, supplements, womens-fashion, home-goods" >&2
  exit 1
fi

SOURCE_DIR="$PROFILES_DIR/$PROFILE/media"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "error: $SOURCE_DIR does not exist. This checkout has no generated media for" >&2
  echo "  profile \"$PROFILE\" (it is gitignored, so a fresh clone never has it —" >&2
  echo "  run this from wherever the store-profile media pipeline last produced it)." >&2
  exit 1
fi

DEPLOY_SSH_HOST="${DEPLOY_SSH_HOST:-${CONTABO_SERVER_IP:-}}"
if [[ -z "$DEPLOY_SSH_HOST" ]]; then
  echo "error: DEPLOY_SSH_HOST is not set and CONTABO_SERVER_IP is not in the environment." >&2
  echo "  Source it first, e.g.: export CONTABO_SERVER_IP=\$(grep '^CONTABO_SERVER_IP=' ~/upready/.env.keys | cut -d= -f2)" >&2
  exit 1
fi
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-root}"
MEDIA_HOST_PATH="${MEDIA_HOST_PATH:-/opt/stands/media}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

REMOTE_DIR="$MEDIA_HOST_PATH/$PROFILE"
DEST="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${REMOTE_DIR}/"

echo "[sync-media] ensuring $REMOTE_DIR exists on $DEPLOY_SSH_HOST"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}" "mkdir -p '$REMOTE_DIR'"

echo "[sync-media] rsync $SOURCE_DIR/ -> $DEST ${DRY_RUN:+(dry run)}"
rsync -avz $DRY_RUN \
  --include="*.webp" --include="*.png" --include="*.jpg" \
  --include="manifest.json" \
  --exclude="*" \
  -e "ssh ${SSH_OPTS[*]}" \
  "$SOURCE_DIR/" "$DEST"

echo "[sync-media] done"
