# Source https://raw.githubusercontent.com/traefik/traefik/master/docs/content/https/ref-acme.yaml
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Traefik ACME/certResolvers reference — the alternative to Caddy considered for custom domains

`doc.traefik.io` itself returned only a client-side redirect shell to WebFetch across six attempts
(the rendered page never reaches WebFetch's HTML→markdown step), so this source is the raw
reference YAML from the `traefik/traefik` GitHub repo (`master` branch) instead —
`docs/content/https/ref-acme.md` no longer exists at that path (404: it has been restructured
upstream since older docs snapshots), but `ref-acme.yaml` in the same directory is current and is
the canonical machine-readable list of every ACME option Traefik supports.

## Challenge types (`certificatesResolvers.<name>.acme`)

- `tlsChallenge` — TLS-ALPN-01, optional but recommended, no extra config.
- `httpChallenge` — HTTP-01, requires `entryPoint` (which entry point serves the challenge).
- `dnsChallenge` — DNS-01, requires `provider` (e.g. `digitalocean`); comment reads verbatim:
  **"mandatory for wildcard certificate generation"** — same constraint as Caddy (source-5): a
  wildcard needs DNS-01, HTTP/TLS-ALPN challenges cannot produce one.
- `dnsChallenge` extras: `delayBeforeCheck` (seconds, default 0), `resolvers` (custom DNS servers
  for propagation checks, default empty), `disablePropagationCheck` (default false, NOT
  recommended — "increase the risk of reaching Let's Encrypt's rate limits").

## No "ask endpoint" construct

Nothing in this reference describes a per-request callback like Caddy's `on_demand_tls.ask`. Every
resolver option here is static configuration (email, storage file, CA server, challenge choice);
domains are attached to certs via a **router's** `tls.domains` (main + SANs), which Traefik learns
from its configured providers (Docker labels, file, KV — all declarative, known ahead of time
through the provider, not decided live per incoming Host). This is architectural evidence, not
silence: Caddy's on-demand feature exists as a named, documented mechanism precisely because
"decide per never-seen-before Host, live" is not the default ACME model, and Traefik's own
reference does not carry an equivalent option.

## What this means for the recommendation (§4/§7 of the spec)

For custom tenant domains, where the whole point is "a domain neither of us has seen before shows
up and must be approved against the tenant DB before a cert is issued", Caddy's on-demand TLS is a
built-in fit; reproducing that behavior on Traefik would mean writing a controller that watches the
tenant-domains table and pushes dynamic router config into Traefik's file/HTTP provider on domain
creation — extra code Caddy doesn't require. That is the reason to recommend Caddy for the
proxy tier over the already-proven-on-this-host Traefik/`coolify-proxy` (source: this file +
`~/upready/memory/agent-creatr-prod-deploy-contabo.md`), even though Traefik is the option with
zero new operational risk (it is already running well for the five stands).
