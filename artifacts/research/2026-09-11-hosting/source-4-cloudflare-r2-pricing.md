# Source https://developers.cloudflare.com/r2/pricing/
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Cloudflare R2 pricing — the object store already chosen for platform backups (rule 42d)

## Standard storage class

- Storage: **$0.015/GB-month**
- Class A operations (writes/lists — PutObject, ListObjects, etc.): **$4.50 per million**
- Class B operations (reads — GetObject, HeadObject, etc.): **$0.36 per million**
- Egress: **free** (this is R2's headline differentiator vs S3)

## Infrequent Access storage class

- Storage: **$0.01/GB-month**
- Class A operations: **$9.00 per million**
- Class B operations: **$0.90 per million**
- Data retrieval: **$0.01/GB**
- Egress: free

## Free tier (Standard storage only, per account)

- 10 GB-month storage
- 1,000,000 Class A requests/month
- 10,000,000 Class B requests/month
- Free egress on all classes

## Verbatim detail worth keeping

"Egressing directly from R2, including via the Workers API, S3 API, and r2.dev domains does not
incur data transfer charges and is free."

## Reading for our growth table

Tenant files (product images, uploads) live under `tenants/<id>/` in R2 (decision in
`docs/multitenancy/2026-09-11-night-2-platform-brief.md` part A2). At Standard-class prices, 1 GB
of tenant media costs $0.015/month to store and effectively nothing to serve (free egress) — the
object-count/Class-B-ops side only starts mattering at very high request volume, which is a
storefront-traffic question, not a per-tenant-growth one. This session could not read the live
bucket's current object count/bytes (TLS failure, see the platform-measurements R2 note) so the
"today" baseline in the growth table is $0 measured / priced-per-GB projected only.
