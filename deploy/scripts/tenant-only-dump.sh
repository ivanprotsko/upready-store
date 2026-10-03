#!/usr/bin/env bash
# Dumps ONE tenant of the live mt database, every other tenant cut out before
# the dump leaves the host (t-cherk-14). Run it on the mt host (contabo) as the
# operator; it never writes to the live database.
#
#   deploy/scripts/tenant-only-dump.sh <handle> [--dry-run]
#       [--media-host-from <host> --media-host-to <host>] [--rewrite-host <from>=<to>]...
#       [--forbid-host <host>]...
#
#   For cherkashino.ru moving to the RU host (t-cherk-14):
#   deploy/scripts/tenant-only-dump.sh olavka \
#       --media-host-from shipshift.dev --media-host-to api.cherkashino.ru \
#       --rewrite-host cherkashino.shipshift.dev=cherkashino.ru \
#       --forbid-host upready.dev --forbid-host cherkashino.com
#
#   A dry run that fails on a host lists every host name still linked
#   ("still linked: …"); map each with --rewrite-host and run again.
#
#   1. pg_dump of the live database (read-only), inside the postgres container
#   2. pg_restore into a fresh temporary database that carries the scratch-copy
#      marker (apps/backend/src/scripts/tenant-only/README.md, "The Marker")
#   3. trim to <handle> in one transaction: every URL on --media-host-from is
#      rewritten to --media-host-to (product, variant and image URLs, branding,
#      metadata, page bodies), shop addresses on a forbidden host are dropped,
#      checks run inside it (no row may mention --media-host-from, a
#      --forbid-host or a removed shop's host), COMMIT only when all pass
#   4. --verify again in a separate session
#   5. marker removed, pg_dump of the trimmed database to $OUT_DIR, with a
#      sha256 sidecar; the archive is listed back with pg_restore -l
#   6. the temporary database is dropped (also on any failure, by the trap)
#   7. the tenant's media under $TENANT_MEDIA_HOST_PATH/<tenant_id>/ is listed
#      and packed into one tar, and every /static/ prefix the data references
#      is written next to it, so files outside that directory are not forgotten
#
# There is no SSH path between this host and the RU host (docs/instances/
# RULES.md §4). The summary at the end shows how to stream the files through
# the operator's machine without writing them to its disk.
#
# --dry-run stops after step 3 with a ROLLBACK and prints what would go.
#
# Environment (defaults match deploy/compose.mt.yml and deploy/backup/RUNBOOK.md):
#   PG_CONTAINER            postgres container               mt-postgres
#   PG_USER                 database role                    medusa
#   SOURCE_DB               live database (read only)        medusa_mt
#   OUT_DIR                 where the dump and lists land    /opt/upready-store/backups/tenant-only
#   TENANT_MEDIA_HOST_PATH  tenant uploads on the host       /opt/upready-store/media-tenants
#   TENANT_ONLY_PG_LOCAL=1  run psql/pg_dump/pg_restore from PGBIN (or PATH)
#                           against PGHOST/PGPORT instead of `docker exec`;
#                           how the script is tested on a workstation
#
# Exit codes: 0 done; 1 usage or environment; 2 guard refused; 3 a check
# failed; 4 dump, restore or another step failed. Nothing printed here is
# personal data: only counts, table names and check names.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$REPO_ROOT/apps/backend/src/scripts/tenant-only/tenant-only.sql"

log() { echo "[tenant-only-dump] $*" >&2; }
die() { local code="$1"; shift; log "error: $*"; exit "$code"; }

USAGE="usage: $(basename "$0") <handle> [--dry-run] [--media-host-from <host> --media-host-to <host>] [--rewrite-host <from>=<to>]... [--forbid-host <host>]..."
HOST_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$'
HANDLE="${1:-}"
[[ "$HANDLE" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die 1 "$USAGE  (handle: lowercase letters, digits, dashes)"
shift
DRY_RUN=0
MEDIA_FROM=""
MEDIA_TO=""
FORBID=()
REWRITES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --media-host-from) MEDIA_FROM="${2:-}"; shift 2 || die 1 "$USAGE" ;;
    --media-host-to) MEDIA_TO="${2:-}"; shift 2 || die 1 "$USAGE" ;;
    --forbid-host) FORBID+=("${2:-}"); shift 2 || die 1 "$USAGE" ;;
    --rewrite-host) REWRITES+=("${2:-}"); shift 2 || die 1 "$USAGE" ;;
    *) die 1 "unknown argument \"$1\"; $USAGE" ;;
  esac
done
if [[ -n "$MEDIA_FROM" || -n "$MEDIA_TO" ]]; then
  [[ -n "$MEDIA_FROM" && -n "$MEDIA_TO" ]] || die 1 "--media-host-from and --media-host-to go together"
  [[ "$MEDIA_FROM" != "$MEDIA_TO" ]] || die 1 "--media-host-to must differ from --media-host-from"
  FORBID+=("$MEDIA_FROM")
fi
for pair in ${REWRITES[@]+"${REWRITES[@]}"}; do
  [[ "$pair" == *=* && "${pair%%=*}" != "${pair#*=}" && "${pair#*=}" != *=* ]] || die 1 "--rewrite-host \"$pair\" must be <from>=<to>"
  [[ "${pair#*=}" =~ $HOST_RE ]] || die 1 "\"${pair#*=}\" is not a lowercase host name"
  FORBID+=("${pair%%=*}")
done
for host in ${MEDIA_TO:+"$MEDIA_TO"} ${FORBID[@]+"${FORBID[@]}"}; do
  [[ "$host" =~ $HOST_RE ]] || die 1 "\"$host\" is not a lowercase host name"
done
# A Postgres text[] literal; the hosts were validated above, so no quoting is needed.
HOSTS_ARRAY="{$(IFS=,; echo "${FORBID[*]+${FORBID[*]}}")}"
REWRITES_ARRAY="{$(IFS=,; echo "${REWRITES[*]+${REWRITES[*]}}")}"
[[ -f "$SQL_FILE" ]] || die 1 "$SQL_FILE is missing; run this from a checkout of upready-store"

PG_CONTAINER="${PG_CONTAINER:-mt-postgres}"
PG_USER="${PG_USER:-medusa}"
SOURCE_DB="${SOURCE_DB:-medusa_mt}"
OUT_DIR="${OUT_DIR:-/opt/upready-store/backups/tenant-only}"
TENANT_MEDIA_HOST_PATH="${TENANT_MEDIA_HOST_PATH:-/opt/upready-store/media-tenants}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TMP_DB="tenant_only_${HANDLE//-/_}_${STAMP//-/_}"
# Inside the container in docker mode; TENANT_ONLY_TMPDIR on the workstation.
CONTAINER_DUMP="${TENANT_ONLY_TMPDIR:-/tmp}/${TMP_DB}.source.dump"
BASE="$OUT_DIR/${HANDLE}-${STAMP}"

# pg_exec <binary> <args...>: one Postgres client call, in the container or local.
if [[ "${TENANT_ONLY_PG_LOCAL:-}" == "1" ]]; then
  PGBIN_DIR="${PGBIN:-}"
  pg_exec() {
    local bin="$1"; shift
    "${PGBIN_DIR:+$PGBIN_DIR/}$bin" -U "$PG_USER" "$@"
  }
else
  command -v docker >/dev/null 2>&1 || die 1 "docker is not on PATH (set TENANT_ONLY_PG_LOCAL=1 to use local clients)"
  docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -q true \
    || die 1 "container $PG_CONTAINER is not running"
  pg_exec() {
    local bin="$1"; shift
    docker exec -i "$PG_CONTAINER" "$bin" -U "$PG_USER" "$@"
  }
fi

psql_db() {
  local db="$1"; shift
  pg_exec psql -X -q -v ON_ERROR_STOP=1 -P pager=off -d "$db" "$@"
}

CREATED=0
cleanup() {
  local status=$?
  if [[ "$CREATED" == "1" ]]; then
    log "dropping temporary database $TMP_DB"
    psql_db postgres -c "DROP DATABASE IF EXISTS \"$TMP_DB\" WITH (FORCE);" >/dev/null 2>&1 \
      || log "warning: could not drop $TMP_DB, drop it by hand: it holds a full copy of the live data"
  fi
  if [[ "${TENANT_ONLY_PG_LOCAL:-}" == "1" ]]; then
    rm -f "$CONTAINER_DUMP"
  else
    docker exec "$PG_CONTAINER" rm -f "$CONTAINER_DUMP" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

# Maps psql's exit to ours: psql exits 3 on any SQL error under ON_ERROR_STOP,
# so the SQLSTATE in its output decides between guard, check and other.
run_sql_step() {
  local label="$1" db="$2" logfile="$3"; shift 3
  local status=0
  { cat "$SQL_FILE"; cat; } | psql_db "$db" "$@" -f - 2>&1 | tee -a "$logfile" || status=${PIPESTATUS[1]}
  if [[ "$status" -ne 0 ]]; then
    if grep -q "tenant-only guard" "$logfile"; then die 2 "$label: the guard refused the database"; fi
    if grep -q "tenant-only verify" "$logfile"; then die 3 "$label: checks failed, nothing was committed"; fi
    die 4 "$label failed (psql exit $status), see $logfile"
  fi
}

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
LOG_FILE="$BASE.log"
: > "$LOG_FILE"
chmod 600 "$LOG_FILE"

log "source $SOURCE_DB, keep \"$HANDLE\", temporary database $TMP_DB$([[ $DRY_RUN == 1 ]] && echo ', DRY RUN')"
[[ -n "$MEDIA_FROM" ]] && log "media host //$MEDIA_FROM -> //$MEDIA_TO"
[[ "$REWRITES_ARRAY" != "{}" ]] && log "host rewrites $REWRITES_ARRAY"
[[ "$HOSTS_ARRAY" != "{}" ]] && log "forbidden hosts $HOSTS_ARRAY"

# 1-2. Copy of the live database into a marked temporary database.
psql_db postgres -c "CREATE DATABASE \"$TMP_DB\";" || die 4 "could not create $TMP_DB"
CREATED=1
{ cat "$SQL_FILE"; echo "SELECT pg_temp.tenant_only_mark(:'source', ARRAY[:'source']);"; } \
  | psql_db "$TMP_DB" -v source="$SOURCE_DB" -At -f - >>"$LOG_FILE" || die 4 "could not mark $TMP_DB"
log "dumping $SOURCE_DB (read only)"
pg_exec pg_dump -Fc -d "$SOURCE_DB" -f "$CONTAINER_DUMP" || die 4 "pg_dump of $SOURCE_DB failed"
log "restoring into $TMP_DB"
pg_exec pg_restore --no-owner --exit-on-error -d "$TMP_DB" "$CONTAINER_DUMP" || die 4 "pg_restore into $TMP_DB failed"
if [[ "${TENANT_ONLY_PG_LOCAL:-}" == "1" ]]; then rm -f "$CONTAINER_DUMP"; else docker exec "$PG_CONTAINER" rm -f "$CONTAINER_DUMP"; fi

# 3. Trim, checks inside the same transaction.
FINISH="SELECT pg_temp.tenant_only_assert_clean(); COMMIT;"
[[ "$DRY_RUN" == "1" ]] && FINISH="ROLLBACK;"
log "trimming to \"$HANDLE\"$([[ $DRY_RUN == 1 ]] && echo ' (dry run, rolled back at the end)')"
run_sql_step "trim" "$TMP_DB" "$LOG_FILE" -v keep="$HANDLE" -v source="$SOURCE_DB" \
  -v mfrom="$MEDIA_FROM" -v mto="$MEDIA_TO" -v hosts="$HOSTS_ARRAY" -v rewrites="$REWRITES_ARRAY" <<SQL
BEGIN;
CREATE TEMP TABLE tok_out ON COMMIT DROP AS
  SELECT * FROM pg_temp.tenant_only_run(:'keep', false, ARRAY[:'source'],
    NULLIF(:'mfrom', ''), NULLIF(:'mto', ''), :'hosts'::text[], :'rewrites'::text[]);
\echo '== tables: before, removed, left'
SELECT name AS "table", before_n AS before, before_n - after_n AS removed, after_n AS "left"
  FROM tok_out WHERE section = 'table' AND before_n <> after_n ORDER BY name;
SELECT count(*) AS tables, sum(before_n) AS rows_before, sum(after_n) AS rows_left FROM tok_out WHERE section = 'table';
\echo '== steps'
SELECT after_n AS rows, name AS step FROM tok_out WHERE section = 'step' AND coalesce(after_n, 1) <> 0;
\echo '== checks (passed fail-level checks hidden)'
SELECT detail AS severity, after_n AS findings, name AS "check"
  FROM tok_out WHERE section = 'check' AND NOT (detail = 'fail' AND after_n = 0);
SELECT count(*) FILTER (WHERE detail = 'fail' AND after_n = 0) AS checks_passed,
       count(*) FILTER (WHERE detail = 'fail' AND after_n > 0) AS checks_failed
  FROM tok_out WHERE section = 'check';
$FINISH
SQL

if [[ "$DRY_RUN" == "1" ]]; then
  log "dry run done; nothing was dumped. Log: $LOG_FILE"
  exit 0
fi

# 4. Verify again, separately, read-only.
log "verifying in a separate session"
run_sql_step "verify" "$TMP_DB" "$LOG_FILE" -v keep="$HANDLE" -v hosts="$HOSTS_ARRAY" <<'SQL'
BEGIN;
SELECT severity, findings, check_name AS "check" FROM pg_temp.tenant_only_check(:'keep', false, :'hosts'::text[])
 WHERE NOT (severity = 'fail' AND findings = 0);
SELECT pg_temp.tenant_only_assert_clean();
ROLLBACK;
SQL

TENANT_ID="$(echo "SELECT id FROM tenant WHERE handle = :'keep';" | psql_db "$TMP_DB" -At -v keep="$HANDLE" -f -)"
[[ "$TENANT_ID" =~ ^ten_[0-9A-Z]{26}$ ]] || die 4 "could not read the id of \"$HANDLE\""

{ cat "$SQL_FILE"; echo "BEGIN; SELECT prefix, own, rows_n FROM pg_temp.tenant_only_media_refs(:'keep'); ROLLBACK;"; } \
  | psql_db "$TMP_DB" -v keep="$HANDLE" -A -F $'\t' -P footer=off -f - > "$BASE.static-refs.tsv" || die 4 "could not list /static/ references"

# 5. Unmark, dump, check the archive.
{ cat "$SQL_FILE"; echo "SELECT pg_temp.tenant_only_unmark();"; } | psql_db "$TMP_DB" -At -f - >>"$LOG_FILE" \
  || die 4 "could not remove the marker"
log "dumping the trimmed database to $BASE.dump"
pg_exec pg_dump -Fc -d "$TMP_DB" > "$BASE.dump" || die 4 "pg_dump of $TMP_DB failed"
chmod 600 "$BASE.dump"
[[ -s "$BASE.dump" ]] || die 4 "$BASE.dump is empty"
OBJECTS="$(pg_exec pg_restore -l < "$BASE.dump" | grep -c ';' || true)"
[[ "${OBJECTS:-0}" -gt 0 ]] || die 4 "pg_restore -l could not read $BASE.dump"
( cd "$OUT_DIR" && { command -v sha256sum >/dev/null && sha256sum "$(basename "$BASE.dump")" || shasum -a 256 "$(basename "$BASE.dump")"; } ) > "$BASE.dump.sha256"

# 7. Media of the kept tenant.
MEDIA_DIR="$TENANT_MEDIA_HOST_PATH/$TENANT_ID"
if [[ -d "$MEDIA_DIR" ]]; then
  ( cd "$MEDIA_DIR" && find . -type f | sed 's#^\./##' | sort ) > "$BASE.media.txt"
  MEDIA_FILES="$(wc -l < "$BASE.media.txt" | tr -d ' ')"
  MEDIA_SIZE="$(du -sh "$MEDIA_DIR" | cut -f1)"
  tar -C "$MEDIA_DIR" -czf "$BASE.media.tar.gz" -T "$BASE.media.txt" || die 4 "could not pack the media"
  chmod 600 "$BASE.media.tar.gz"
else
  : > "$BASE.media.txt"
  MEDIA_FILES=0
  MEDIA_SIZE="0"
  log "warning: $MEDIA_DIR does not exist; check TENANT_MEDIA_HOST_PATH"
fi
OUTSIDE="$(awk -F'\t' 'NR > 1 && $2 == "f" { n++ } END { print n + 0 }' "$BASE.static-refs.tsv")"

log "done"
cat >&2 <<EOF

  tenant         $HANDLE ($TENANT_ID)
  dump           $BASE.dump ($OBJECTS archive entries)
  checksum       $BASE.dump.sha256
  log            $LOG_FILE
  media          $MEDIA_FILES files, $MEDIA_SIZE under $MEDIA_DIR
                 list: $BASE.media.txt, archive: $BASE.media.tar.gz
  /static/ refs  $BASE.static-refs.tsv ($OUTSIDE prefix(es) outside static/tenants/$TENANT_ID)

  The two hosts have no SSH path to each other. From the operator's machine,
  stream each file through without writing it there, for example:
    ssh <this-host> cat $BASE.dump | ssh <ru-host> 'cat > /opt/upready-store/backups/$(basename "$BASE").dump'
    ssh <this-host> cat $BASE.media.tar.gz | ssh <ru-host> 'tar -C <tenant-media-path>/$TENANT_ID -xzf -'
  then check the sha256 on the RU host against $BASE.dump.sha256.

EOF
