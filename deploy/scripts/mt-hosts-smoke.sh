#!/bin/sh
# Smoke test for the multi-tenant ingress (audit 46df A-01): every host a shop
# answers on is published to traefik and answers with something other than a
# gateway error.
#
# Why it exists: cherkashino.shipshift.dev, the address olavka answered on
# before its handle changed, returned a bare `502 Bad Gateway` from traefik's
# catch-all for a week while nothing noticed. The backend resolved the host,
# the ingress script in the repository published old handles, and yet
# mt-ingress-sync was still looping on a script body from before aliases and
# tenant ids were published at all (measured 2026-09-30: no `ten_…` host and
# no alias host among the 29 in mt-tenants.yml). No check looked at the hosts
# from the outside.
#
# Checks, all read-only (SELECTs and GETs):
#   script   the ingress container runs the same tenant-ingress-sync.sh as this
#            checkout. A single-file bind mount keeps the inode it started with,
#            so an rsync that replaces the file is invisible to the container
#            until it is recreated.
#   ingress  every host has a router in traefik's file.
#   http     GET https://<host><SMOKE_PATH> gets an answer, and not a 5xx. A
#            redirect passes: an old handle is supposed to answer 301.
#
# The host list comes from the database by default, through
# `tenant-ingress-sync.sh --list` from this checkout, so it is exactly what the
# CURRENT script would publish. psql runs inside the Postgres container over its
# socket, not across the network the ingress container uses. With
# `--hosts FILE` (`-` for stdin) the list is read from the file instead, and the
# script and ingress checks are skipped where their inputs are not at hand,
# which is how it runs from a laptop.
#
#   deploy/scripts/mt-hosts-smoke.sh                     # on the mt host, as root
#   deploy/scripts/mt-hosts-smoke.sh --hosts hosts.txt   # anywhere with curl
#
# Env:
#   TENANT_BASE_DOMAINS  comma-separated base domains, default shipshift.dev
#   PG_CONTAINER         default mt-postgres
#   PG_USER              default medusa
#   PG_DB                default medusa_mt
#   INGRESS_CONTAINER    default mt-ingress-sync
#   INGRESS_FILE         default /data/coolify/proxy/dynamic/mt-tenants.yml
#   SMOKE_PATH           default /ru
#   SMOKE_TIMEOUT        seconds per request, default 15
#
# Exit 0 when every check passed, 1 when one failed, 2 on a usage error.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
INGRESS_SCRIPT="$HERE/tenant-ingress-sync.sh"
TENANT_BASE_DOMAINS="${TENANT_BASE_DOMAINS:-shipshift.dev}"
PG_CONTAINER="${PG_CONTAINER:-mt-postgres}"
PG_USER="${PG_USER:-medusa}"
PG_DB="${PG_DB:-medusa_mt}"
INGRESS_CONTAINER="${INGRESS_CONTAINER:-mt-ingress-sync}"
INGRESS_FILE="${INGRESS_FILE:-/data/coolify/proxy/dynamic/mt-tenants.yml}"
SMOKE_PATH="${SMOKE_PATH:-/ru}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-15}"

hosts_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --hosts)
      [ $# -ge 2 ] || { echo "usage: $0 [--hosts FILE|-]" >&2; exit 2; }
      hosts_file="$2"
      shift 2
      ;;
    *) echo "usage: $0 [--hosts FILE|-]" >&2; exit 2 ;;
  esac
done

failures=0
fail() { echo "FAIL  $*"; failures=$((failures + 1)); }
pass() { echo "ok    $*"; }
skip() { echo "skip  $*"; }
have_docker() { command -v docker >/dev/null 2>&1; }

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# The hosts to check.
if [ -n "$hosts_file" ]; then
  if [ "$hosts_file" = "-" ]; then list=$(cat); else list=$(cat "$hosts_file"); fi
else
  have_docker || { echo "no docker here: pass --hosts FILE" >&2; exit 2; }
  shim=$(mktemp -d)
  trap 'rm -rf "$shim"' EXIT
  # tenant-ingress-sync.sh calls `psql "$DATABASE_URL" -At -c <query>`; the
  # socket inside the container needs no URL, so the first argument is dropped.
  cat > "$shim/psql" <<EOF
#!/bin/sh
shift
exec docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" "\$@"
EOF
  chmod +x "$shim/psql"
  list=$(PATH="$shim:$PATH" DATABASE_URL=socket TENANT_BASE_DOMAINS="$TENANT_BASE_DOMAINS" \
    sh "$INGRESS_SCRIPT" --list) || {
    fail "hosts   tenant-ingress-sync.sh --list could not read the database through $PG_CONTAINER"
    exit 1
  }
fi
list=$(echo "$list" | tr -d ' \t\r' | grep -v -e '^$' -e '^#' | sort -u) || true
[ -n "$list" ] || { fail "hosts   the host list is empty"; exit 1; }

# The script the ingress container actually runs.
if have_docker && docker inspect "$INGRESS_CONTAINER" >/dev/null 2>&1; then
  inside=$(docker exec "$INGRESS_CONTAINER" sha256sum /usr/local/bin/tenant-ingress-sync.sh 2>/dev/null | cut -d' ' -f1) || inside=""
  if [ -n "$inside" ] && [ "$inside" = "$(sha256_of "$INGRESS_SCRIPT")" ]; then
    pass "script  $INGRESS_CONTAINER runs this checkout's tenant-ingress-sync.sh"
  else
    fail "script  $INGRESS_CONTAINER runs another tenant-ingress-sync.sh than $INGRESS_SCRIPT (recreate it: docker compose -p mt ... up -d --force-recreate ingress)"
  fi
else
  skip "script  no $INGRESS_CONTAINER container to compare with"
fi

check_ingress=no
if [ -r "$INGRESS_FILE" ]; then check_ingress=yes; else skip "ingress $INGRESS_FILE is not readable here"; fi

count=0
for host in $list; do
  count=$((count + 1))
  if [ "$check_ingress" = yes ] && ! grep -qF "Host(\`$host\`)" "$INGRESS_FILE"; then
    fail "ingress $host has no router in $INGRESS_FILE"
  fi
  set +e
  answer=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time "$SMOKE_TIMEOUT" "https://$host$SMOKE_PATH" 2>/dev/null)
  curl_status=$?
  set -e
  code=${answer%% *}
  case "$code" in
    "" | 000) fail "http    $host$SMOKE_PATH no answer (curl exit $curl_status)" ;;
    5*) fail "http    $host$SMOKE_PATH answered $code" ;;
    *) pass "http    $host$SMOKE_PATH $answer" ;;
  esac
done

echo "$count hosts checked, $failures failed"
[ "$failures" -eq 0 ]
