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
  `/healthz` answers `ok`, `/robots.txt` disallows everything, `/landing/` answers the page's own
  files (a day of caching, 404 for a missing one).
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

## A second page on the same host: store.upready.dev

Ordered in t-2026-10-07-08 (Ivan, 2026-10-07: «а лендинг который скоро сделаем, по адресу
store.upready.dev/ ( а пока лендинга нет, давай там заглушку )»). The page is
[html-store](./html-store/index.html): two languages on one page and a sign-in link to `/app`.

contabo already runs `olavka-placeholder`, so this one is a second compose project with its own
names. `up.sh` takes them as a third and a fourth argument:

```bash
/opt/upready-store/placeholder/up.sh store \
  'Host(`store.upready.dev`) && (Path(`/`) || Path(`/index.html`))' store 300
```

That gives project `placeholder-store`, container `store-placeholder`, routers `store-ph*` and
the env file `placeholder-store.env`. The rule names the two paths only, because `/app` on the
same host belongs to another router; the priority puts this router ahead of it for those two
paths (traefik's default order is by rule length, and the other rule is the longer one). The
same pattern already serves the landing on shipshift.dev (`mt-homepage.yml` on the host,
priority 300).

Remove it with `docker compose -p placeholder-store … --env-file placeholder-store.env down`.

## The school landing: school.cherkashina.ru

Ordered in t-2026-10-08-35 (Ivan, 2026-10-08, ask 81da: «а лендинг школы тут school.cherkashina.ru»).
The page is [html-school](./html-school/index.html): the school of Oksana Cherkashina, its course
with a «Купить» link to the course page of the shop cherkashino.ru, how the learning works and a
«Войти в кабинет» button to `/login`. It carries `noindex` until the school opens.

The school cabinet runs on the same host and owns `/app`, `/login`, `/auth`, `/logout` and
`/assets`. The landing owns the root and `/landing/`, where its fonts and the course cover live
(`html-school/landing/`). [nginx.conf](./nginx.conf) answers `/landing/` with the files themselves
and a 404 for a missing one, so the rule names both paths:

```bash
/opt/upready-store/placeholder/up.sh school \
  'Host(`school.cherkashina.ru`) && (Path(`/`) || PathPrefix(`/landing/`))' school 300
```

That gives project `placeholder-school`, container `school-placeholder`, routers `school-ph*` and
the env file `placeholder-school.env`. `/robots.txt` and `/favicon.ico` on this host go to the
cabinet's router, not to this page.

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
