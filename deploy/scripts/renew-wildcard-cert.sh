#!/bin/sh
# Keeps the wildcard certificate for the tenant base domain alive.
#
# Why the wildcard exists at all: traefik asks Let's Encrypt for a per-host
# certificate only AFTER the host shows up in mt-tenants.yml, and answers every
# handshake before that with its self-signed "TRAEFIK DEFAULT CERT". The whole
# .dev zone is on Chrome's HSTS preload list, so the shop owner who opens the
# address the wizard just gave them gets ERR_CERT_AUTHORITY_INVALID with no way
# to click through — measured 2026-09-12 on testovyy-magazin.shipshift.dev,
# where traefik's default certificate carries the timestamp of that very visit.
# A wildcard in traefik's TLS store (dynamic/mt-wildcard-tls.yml) makes every
# <handle>.shipshift.dev trusted from its first second and costs zero Let's
# Encrypt quota per shop.
#
#   /opt/upready-store/mt/deploy/scripts/renew-wildcard-cert.sh          # cron
#   /opt/upready-store/mt/deploy/scripts/renew-wildcard-cert.sh --force  # now
#
# Cron (root, on the host that runs coolify-proxy):
#   20 4 * * * /opt/upready-store/mt/deploy/scripts/renew-wildcard-cert.sh >> /var/log/wildcard-renew.log 2>&1
#
# Credentials: $LEGO_ENV_FILE holds CLOUDFLARE_DNS_API_TOKEN=… (mode 600). The
# challenge is DNS-01, so this works for a wildcard, which HTTP-01 cannot do.
set -eu

DOMAIN="${WILDCARD_DOMAIN:-*.shipshift.dev}"
CERT_NAME="${WILDCARD_CERT_NAME:-_.shipshift.dev}"
LEGO_DIR="${LEGO_DIR:-/data/coolify/proxy/lego}"
DYNAMIC_DIR="${TRAEFIK_DYNAMIC_DIR:-/data/coolify/proxy/dynamic}"
ENV_FILE="${LEGO_ENV_FILE:-/root/.lego-cf.env}"
EMAIL="${ACME_EMAIL:-admin@upready.dev}"
RENEW_BEFORE_DAYS="${RENEW_BEFORE_DAYS:-30}"

CERT="$LEGO_DIR/certificates/$CERT_NAME.crt"
YML="$DYNAMIC_DIR/mt-wildcard-tls.yml"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

[ -f "$ENV_FILE" ] || { echo "[renew-wildcard] $ENV_FILE is missing (CLOUDFLARE_DNS_API_TOKEN=…)" >&2; exit 1; }
[ -f "$YML" ] || { echo "[renew-wildcard] $YML is missing — traefik is not serving this certificate" >&2; exit 1; }

# The expiry is decided here and not left to lego: a daily cron that re-issues
# every run would spend the Let's Encrypt duplicate-certificate budget (5 per
# week for an identical set of names) in five days.
if [ "$FORCE" -eq 0 ] && [ -f "$CERT" ] &&
   openssl x509 -in "$CERT" -noout -checkend $((RENEW_BEFORE_DAYS * 24 * 3600)) >/dev/null 2>&1; then
  echo "[renew-wildcard] $(stamp) $DOMAIN valid for more than $RENEW_BEFORE_DAYS days — nothing to do"
  exit 0
fi

before=""
[ -f "$CERT" ] && before=$(sha256sum "$CERT" | cut -d' ' -f1)

# --dns.resolvers is not cosmetic: this host's own recursive nameserver
# (213.136.95.10) never returned the freshly written TXT record and lego's
# propagation check timed out — the first issuance failed exactly there
# (2026-09-12), and went through unchanged once the check asked 1.1.1.1.
# lego sleeps a random stretch before a renewal on purpose — it spreads the
# load of everyone's cron across the hour, and the nightly run has the time.
# A run asked for by hand does not: measured 2026-09-12, `--force` sat in that
# sleep for nine minutes before doing anything.
NOW=""
[ "$FORCE" -eq 1 ] && NOW="--no-random-sleep"

# shellcheck disable=SC2086  # $NOW is one optional flag, deliberately unquoted
docker run --rm --env-file "$ENV_FILE" -v "$LEGO_DIR:/acme" goacme/lego \
  run --accept-tos --email "$EMAIL" --dns cloudflare \
  --dns.resolvers 1.1.1.1:53 --dns.resolvers 8.8.8.8:53 \
  $NOW --renew-force --domains "$DOMAIN" --path /acme

after=$(sha256sum "$CERT" | cut -d' ' -f1)
if [ "$before" = "$after" ]; then
  echo "[renew-wildcard] $(stamp) lego finished but $CERT did not change — traefik keeps the old certificate" >&2
  exit 1
fi

# Traefik watches the dynamic DIRECTORY, not the certificate files a config in
# it points at, so a renewed certificate reaches the running proxy only when
# this configuration file itself changes. The stamp line is that change.
sed -i "s|^# renewed: .*|# renewed: $(stamp)|" "$YML"
grep -q "^# renewed: " "$YML" || { echo "[renew-wildcard] $YML has no '# renewed:' line to stamp — traefik was NOT reloaded" >&2; exit 1; }
echo "[renew-wildcard] $(stamp) renewed $DOMAIN and touched $YML"
