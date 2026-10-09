#!/bin/sh
# Publishes every tenant host into traefik's FILE provider, so a domain added
# in the tenant panel starts answering on https:// without a redeploy.
#
# Why a file and not labels: coolify-proxy runs with
#   --providers.file.directory=/traefik/dynamic/  --providers.file.watch=true
# (measured 2026-09-11 by `docker inspect coolify-proxy`), and that directory is
# the host's /data/coolify/proxy/dynamic. Traefik re-reads a changed file in
# that directory within a second and issues the Let's Encrypt certificate for
# any new Host() it finds (HTTP-01, resolver `letsencrypt`).
#
# Why not on-demand TLS: docs/multitenancy/hosting-spec.md §4 designs that with
# Caddy, whose `on_demand_tls.ask` asks the backend before issuing. Traefik has
# no equivalent (same spec, source 6) and traefik owns :443 on this host. This
# script is the traefik-shaped answer to the same problem: the set of hosts is
# pushed instead of pulled, with the database as the single source of truth.
#
# Why a technical subdomain asks for NO certResolver: the wildcard certificate
# `*.<base>` sits in traefik's TLS store (dynamic/mt-wildcard-tls.yml, renewed
# by deploy/scripts/renew-wildcard-cert.sh), so such a host is trusted from the
# first second instead of after the ~90 s HTTP-01 round trip during which
# traefik answers with its self-signed "TRAEFIK DEFAULT CERT" — measured on
# 2026-09-12, when a shop opened straight after the wizard showed
# ERR_CERT_AUTHORITY_INVALID with no click-through (the whole .dev zone is on
# Chrome's HSTS preload list). It also spends no Let's Encrypt quota per shop:
# the zone had burned 10 of its 50 weekly certificates on tenants that day.
# Custom domains keep the resolver — a wildcard cannot cover them.
#
# Runs in a postgres:16-alpine container (psql, nothing else) — see the
# `ingress` service in deploy/compose.mt.yml. Env:
#   DATABASE_URL         same as the backend's
#   TENANT_BASE_DOMAINS  comma-separated, e.g. "shipshift.dev"
#   TRAEFIK_DYNAMIC_DIR  default /traefik-dynamic
#   STOREFRONT_SERVICE   default http://mt-storefront:8000
#   SYNC_INTERVAL        seconds between polls, default 15
#   DOCS_DOMAINS         comma-separated docs hosts, e.g. "docs.upready.dev,docs.cherkashino.ru";
#                        empty or unset means no docs routers at all (t-2026-10-09-104)
#   DOCS_SERVICE         default http://mt-panel:8081 (the panel image serves the help there)
#
# The docs hosts go into a file of their own, mt-docs.yml, one router and one
# Let's Encrypt certificate per host. They are not tenants and not in the
# database. The list is the env var, and each host shows the platform
# documentation under the logo docs/owner-guide/brands.json gives it. They are
# not labels on the panel service like PANEL_DOMAIN_ALT because traefik v3's
# Host() takes one host, so a list in one variable cannot become a label rule.
# One router for all hosts would also ask for one certificate for all of them,
# which a single host with no DNS record yet would fail for every other.
#
# `--once` writes the files once and exits; `--list` prints the tenant hosts it
# would publish, one per line, writes nothing and exits 1 when the database
# cannot be read; `--docs` prints mt-docs.yml as it would be written and writes
# nothing. deploy/scripts/mt-hosts-smoke.sh reads the list that way, so "a tenant
# host" has one definition, this file's.
set -eu

DIR="${TRAEFIK_DYNAMIC_DIR:-/traefik-dynamic}"
OUT="$DIR/mt-tenants.yml"
TMP="$OUT.tmp"
UPSTREAM="${STOREFRONT_SERVICE:-http://mt-storefront:8000}"
INTERVAL="${SYNC_INTERVAL:-15}"
DOCS_OUT="$DIR/mt-docs.yml"
DOCS_UPSTREAM="${DOCS_SERVICE:-http://mt-panel:8081}"

hosts() {
  # Custom domains are rows; technical subdomains are derived from the handle
  # and the base domains and have no row at all — that is the invariant in
  # docs/multitenancy/storefront-by-host.md §2, so it is re-derived here
  # rather than read.
  psql "$DATABASE_URL" -At -c \
    "select host from tenant_domain where deleted_at is null order by host" 2>/dev/null || return 1
  for base in $(echo "${TENANT_BASE_DOMAINS:-}" | tr ',' ' '); do
    [ -n "$base" ] || continue
    # Three labels under one zone, all covered by the same wildcard certificate:
    # the shop's current handle, its tenant id, and every handle it used to
    # answer on. The last two exist so the storefront can answer them with a 301
    # to the main address — a host traefik does not route cannot redirect
    # anybody (specs/tenant-address/CANONICAL.md §1.2, §1.3).
    #
    # Three separate queries, not one union: tenant_handle_alias arrives with a
    # migration, and on the deploy where the image is newer than the database a
    # union would fail WHOLE and take every shop's router down with it. Each
    # query stands or falls alone.
    #
    # Only the alias query may fail and be skipped, though. `tenant` exists
    # since the first migration, so a failure there is the database, not the
    # schema, and publishing what the other queries returned would drop every
    # technical subdomain until the next poll: measured on the live host
    # 2026-09-30 (audit 46df A-01), the file flipping between 12 hosts (custom
    # domains only) and 26 from one poll to the next. Such a poll now keeps
    # the previous file, like an unreachable database already did.
    for statement in \
      "select handle from tenant where deleted_at is null order by handle" \
      "select lower(id) from tenant where deleted_at is null order by 1" \
      "select handle from tenant_handle_alias where deleted_at is null order by handle"
    do
      labels=$(psql "$DATABASE_URL" -At -c "$statement" 2>/dev/null) || {
        case "$statement" in
          *tenant_handle_alias*) continue ;;
          *) return 1 ;;
        esac
      }
      [ -n "$labels" ] || continue
      echo "$labels" | while read -r label; do
        if [ -n "$label" ]; then echo "$label.$base"; fi
      done
    done
  done
}

# True for a host the `*.<base>` wildcard certificate actually covers: exactly
# one label under one of the base domains. `shop.<base>` yes, `a.b.<base>` no —
# a wildcard matches a single label, so a deeper host still needs its own
# certificate.
covered_by_wildcard() {
  host="$1"
  for base in $(echo "${TENANT_BASE_DOMAINS:-}" | tr ',' ' '); do
    [ -n "$base" ] || continue
    case "$host" in
      *".$base")
        label="${host%".$base"}"
        case "$label" in
          "" | *.*) : ;;
          *) return 0 ;;
        esac
        ;;
    esac
  done
  return 1
}

render() {
  list="$1"
  printf '# Generated by deploy/scripts/tenant-ingress-sync.sh — do not edit by hand.\n'
  printf 'http:\n  routers:\n'
  echo "$list" | while read -r host; do
    [ -n "$host" ] || continue
    slug=$(echo "$host" | tr '.' '-' | tr -cd 'a-z0-9-')
    printf '    mt-t-%s:\n' "$slug"
    printf '      rule: "Host(`%s`)"\n' "$host"
    printf '      entryPoints: ["https"]\n'
    printf '      service: mt-storefront\n'
    if covered_by_wildcard "$host"; then
      printf '      tls: {}\n'
    else
      printf '      tls:\n        certResolver: letsencrypt\n'
    fi
    printf '    mt-t-%s-http:\n' "$slug"
    printf '      rule: "Host(`%s`)"\n' "$host"
    printf '      entryPoints: ["http"]\n'
    printf '      middlewares: ["mt-to-https"]\n'
    printf '      service: mt-storefront\n'
  done
  printf '  middlewares:\n    mt-to-https:\n      redirectScheme:\n        scheme: https\n'
  printf '  services:\n    mt-storefront:\n      loadBalancer:\n        servers:\n          - url: "%s"\n' "$UPSTREAM"
}

sync_once() {
  list=$(hosts) || { echo "[ingress-sync] database not reachable, keeping the previous file"; return 0; }
  if [ -z "$list" ]; then
    # Zero is not empty (rule 20): an empty answer here would silently drop
    # every live storefront, so it is refused, not written.
    echo "[ingress-sync] the query returned no host at all — refusing to write an empty ingress"
    return 0
  fi
  render "$list" > "$TMP"
  if [ -f "$OUT" ] && cmp -s "$TMP" "$OUT"; then
    rm -f "$TMP"
    return 0
  fi
  mv "$TMP" "$OUT"
  echo "[ingress-sync] wrote $(echo "$list" | wc -l | tr -d ' ') hosts to $OUT"
  echo "$list" | tr '\n' ' '
  echo
}

# The docs hosts from DOCS_DOMAINS, lowercased, one per line; a word that is
# not a host name is left out with a line in the log.
docs_hosts() {
  for host in $(echo "${DOCS_DOMAINS:-}" | tr ',' ' ' | tr '[:upper:]' '[:lower:]'); do
    case "$host" in
      *[!a-z0-9.-]* | .* | *. | *..*) echo "[ingress-sync] DOCS_DOMAINS: '$host' is not a host name, skipped" >&2 ;;
      *.*) echo "$host" ;;
      *) echo "[ingress-sync] DOCS_DOMAINS: '$host' is not a host name, skipped" >&2 ;;
    esac
  done
}

docs_render() {
  list="$1"
  printf '# Generated by deploy/scripts/tenant-ingress-sync.sh from DOCS_DOMAINS — do not edit by hand.\n'
  printf 'http:\n  routers:\n'
  echo "$list" | while read -r host; do
    [ -n "$host" ] || continue
    slug=$(echo "$host" | tr '.' '-')
    printf '    mt-docs-%s:\n' "$slug"
    printf '      rule: "Host(`%s`)"\n' "$host"
    printf '      entryPoints: ["https"]\n'
    printf '      service: mt-docs\n'
    printf '      tls:\n        certResolver: letsencrypt\n'
    printf '    mt-docs-%s-http:\n' "$slug"
    printf '      rule: "Host(`%s`)"\n' "$host"
    printf '      entryPoints: ["http"]\n'
    printf '      middlewares: ["mt-docs-to-https"]\n'
    printf '      service: mt-docs\n'
  done
  printf '  middlewares:\n    mt-docs-to-https:\n      redirectScheme:\n        scheme: https\n'
  printf '  services:\n    mt-docs:\n      loadBalancer:\n        servers:\n          - url: "%s"\n' "$DOCS_UPSTREAM"
}

# Writes mt-docs.yml when DOCS_DOMAINS names a host and removes it when it
# names none, so taking the variable out takes the docs routers down too.
docs_once() {
  list=$(docs_hosts)
  if [ -z "$list" ]; then
    if [ -f "$DOCS_OUT" ]; then
      rm -f "$DOCS_OUT"
      echo "[ingress-sync] DOCS_DOMAINS names no host, removed $DOCS_OUT"
    fi
    return 0
  fi
  docs_render "$list" > "$DOCS_OUT.tmp"
  if [ -f "$DOCS_OUT" ] && cmp -s "$DOCS_OUT.tmp" "$DOCS_OUT"; then
    rm -f "$DOCS_OUT.tmp"
    return 0
  fi
  mv "$DOCS_OUT.tmp" "$DOCS_OUT"
  echo "[ingress-sync] wrote the docs hosts to $DOCS_OUT: $(echo "$list" | tr '\n' ' ')"
}

case "${1:-}" in
  --list) hosts ;;
  --docs) docs_render "$(docs_hosts)" ;;
  --once) mkdir -p "$DIR"; sync_once; docs_once ;;
  *) mkdir -p "$DIR"; while true; do sync_once; docs_once; sleep "$INTERVAL"; done ;;
esac
