# Source https://caddyserver.com/docs/automatic-https#on-demand-tls
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Caddy On-Demand TLS — the mechanism proposed for custom tenant domains

## The `ask` endpoint

Caddy sends an HTTP request to the endpoint named in `on_demand_tls.ask` to decide whether it is
allowed to obtain a certificate for a given domain. In our shape this endpoint queries the
backend/DB for whether that domain is registered to a tenant, and Caddy proceeds with ACME
issuance **only on approval** from that endpoint. This maps directly onto the brief's proposed
`GET /store/tenant-domains/check?domain=` contract.

## Rate limiting

The fetched page names the `on_demand_tls` global option as the place this is configured, but the
specific `interval`/`burst` values were not present in what WebFetch could extract from this page
— it only surfaced the general statement that Caddy applies **internal rate limiting to mitigate
accidental abuse**, quoting a figure of **10 ACME attempts per account per 10 seconds** across all
certificate operations (this is Let's Encrypt/ACME-account-level, not specific to on-demand). Cite
the general shape (ask-gated + internally rate-limited) in the spec; do not invent a specific
per-domain on-demand rate-limit number beyond what was fetched.

## Wildcard certificates: NOT compatible with on-demand TLS

Important, and it shapes the design: **wildcard certs cannot be obtained through On-Demand TLS.**
On-demand issuance happens per-connection during the TLS handshake for domains not known in
advance; a wildcard needs to be pre-validated and explicitly configured, which is the opposite of
"unknown domain shows up, ask, then issue". This confirms the two-track design already implied by
the brief: `*.upready.dev` gets ONE statically-configured wildcard cert (DNS-01, issued once,
renewed on its own schedule), and On-Demand TLS is used **only** for custom tenant domains
(`vasya.com`, `petya.ru`), never for the wildcard itself.

## DNS-01 and On-Demand TLS don't combine either

On-Demand TLS works with the HTTP-01 and TLS-ALPN-01 challenge types by default. The DNS-01
challenge needs DNS provider credentials configured **in advance** and is built around knowing
which domains need certs ahead of time to write the right records — which is incompatible with the
on-demand model's premise (domain shows up live, decide then). So custom tenant domains, which
point their own DNS at us (an A/CNAME the tenant controls, not ours), get validated via HTTP-01
(the domain's own A record already points at our proxy, so an HTTP-01 challenge on port 80 works
without touching the tenant's DNS beyond what they were already asked to set) — never DNS-01,
since we don't control the tenant's zone.
