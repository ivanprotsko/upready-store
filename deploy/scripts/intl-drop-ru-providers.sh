#!/usr/bin/env bash
# intl-drop-ru-providers.sh — runs ON contabo as root (scp it, then `bash <file> </dev/null`: piped
# through `bash -s`, `docker exec -i` swallows the rest of the script). Run once on 04.10.2026 06:48 WITA
# under Ivan's standing order of 04.10 (no confirmations until handover); kept in git per checklist K16.
# Soft-deletes the four RU-only provider rows of INTL tenant olavka (ten_01M2GQVGEN1204CN90C510DNRG)
# that deploy/instances/intl.json forbids on this instance (cdek, pochta, robokassa, wildberries),
# so deploy-instance.sh's step 3 (instance-check --db) passes. The RU shop keeps its own copies in
# medusa_ru on the RU host. Backup first; ids are printed for the rollback:
#   update tenant_integration_secret set deleted_at = null where id in ('<ids printed below>');
set -euo pipefail
DIR=/opt/upready-store/mt
DBN=medusa_mt
TEN=ten_01M2GQVGEN1204CN90C510DNRG
TS="$(date +%Y%m%d-%H%M%S)"
log() { echo "[intl-prov $(date -u +%H:%M:%SZ)] $*"; }
q() { docker exec -i mt-postgres psql -U medusa -d "$DBN" -X -At -v ON_ERROR_STOP=1 -c "$1"; }

log "0. before: $(q "select string_agg(provider || case when is_enabled then '' else '(off)' end, ',' order by provider) from tenant_integration_secret where tenant_id='$TEN' and deleted_at is null")"

log "1. backup of $DBN (label pre-intl-drop-ru-providers-$TS)"
BACKUP_TARGET_DIR=/opt/upready-store/backups/mt PG_DUMP_DOCKER_CONTAINER=mt-postgres \
  PG_DUMP_DB_USER=medusa PG_DUMP_DB_NAME="$DBN" BACKUP_LABEL="pre-intl-drop-ru-providers-$TS" \
  PG_RESTORE_BIN=/opt/upready-store/pg-restore-docker.sh \
  "$DIR/deploy/backup/pg-backup.sh" 2>&1 | tail -3

log "2. soft-delete (ids for rollback):"
q "update tenant_integration_secret set deleted_at = now(), updated_at = now()
   where tenant_id='$TEN' and provider in ('cdek','pochta','robokassa','wildberries') and deleted_at is null
   returning id || ' ' || provider"
log "   after: $(q "select coalesce(string_agg(provider, ',' order by provider), '(none)') from tenant_integration_secret where tenant_id='$TEN' and deleted_at is null")"
log "   forbidden providers left in the whole database: $(q "select coalesce(string_agg(distinct provider, ','), '(none)') from tenant_integration_secret where deleted_at is null and provider in ('cdek','pochta','robokassa','wildberries','wildberries_write','ozon','apiship')")"
log "done — rerun deploy-instance.sh intl <ref> from the Mac"
