# Placeholder for the platform domains

A static "coming soon" page for olavka.ru (Russian) and olavka.com (English) until the
marketing site (upready-store-marketing, t-2026-10-04-12) goes live. Ordered in t-2026-10-04-11
(Ivan, 2026-10-04 02:57 WITA: «Заглушку на эти сайты нужно поставить сразу»).

## What is here

- [compose.placeholder.yml](./compose.placeholder.yml) — one `nginx:alpine` container
  (`olavka-placeholder`, 32 MB memory limit) with traefik labels: http → https redirect and an
  https router on the `letsencrypt` resolver. It works unchanged behind both hosts' traefik
  (RU `ru-host-traefik`, contabo `coolify-proxy`): both read docker labels on network `coolify`.
- [nginx.conf](./nginx.conf) — every path answers `index.html` with `Cache-Control: no-cache`,
  `/healthz` answers `ok`, `/robots.txt` disallows everything.
- [html-ru](./html-ru/index.html), [html-en](./html-en/index.html) — the page itself, with
  `<meta name="robots" content="noindex">` so "coming soon" never lands in search results.
- [up.sh](./up.sh) — writes `placeholder.env` (hosts + language + directory) and brings the
  project up. The env file is host-local output and gitignored.

## Run (as root on the host)

The release tree lands in `/opt/upready-store/mt` on every deploy, so after a deploy copy this
directory next to it and start it:

```bash
cp -R /opt/upready-store/mt/deploy/placeholder/. /opt/upready-store/placeholder/
# RU host (201.34.137.28)
/opt/upready-store/placeholder/up.sh ru 'Host(`olavka.ru`) || Host(`www.olavka.ru`)'
# contabo (84.46.251.149)
/opt/upready-store/placeholder/up.sh en 'Host(`olavka.com`) || Host(`www.olavka.com`)'
```

The certificate is issued over HTTP-01 a minute or two after the domain's A record points at
the host. Before that traefik serves its default certificate, which is why `up.sh` checks with
`curl -k`.

## Precondition on contabo

olavka.com and www.olavka.com were custom domains of the INTL tenant `olavka` (handle
`cherkashino`). The tenant ingress ([tenant-ingress-sync.sh](../scripts/tenant-ingress-sync.sh)
→ `mt-tenants.yml`) would otherwise win the Host rule, so on 2026-10-04 the two rows were
soft-deleted first (`tenant_domain.deleted_at`, the same thing the panel's "remove domain"
does) after a pg-backup labelled `pre-olavka-placeholder-20261003-211057`. The shop's main
address became [olavka.shipshift.dev](https://olavka.shipshift.dev/) (`hosts.ts`: primary custom
domain, else `<handle>.<base>`).

Rollback on contabo: `update tenant_domain set deleted_at = null where id in
('tdom_01M34SB6GQ9SXEZ3YKFGRKP1JE', 'tdom_01M34TAN83EMCGTM2XRVFQNHZA')`, then
`is_primary = true` for the olavka.com row, then stop the placeholder (below).

## Remove

```bash
docker compose -p placeholder -f /opt/upready-store/placeholder/compose.placeholder.yml \
  --env-file /opt/upready-store/placeholder/placeholder.env down
```

The routers disappear with the container; nothing else references them.
