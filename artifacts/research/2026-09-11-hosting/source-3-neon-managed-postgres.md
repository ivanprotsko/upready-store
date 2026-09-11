# Source https://neon.com/pricing (redirected from neon.tech/pricing, 308)
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Neon managed Postgres pricing — chosen as the one managed-PG comparison (Hetzner has none)

Picked Neon over Supabase/DigitalOcean managed PG because it prices storage and compute
separately and by usage, which maps cleanly onto "at what DB size / tenant count does this stop
being worth self-hosting" (the §6 "Пороги" question) — Supabase bundles storage+compute+auth+
realtime into flatter tiers that are harder to attribute to Postgres alone, and DO's managed PG is
priced like a VM tier (closer to what we already have on Contabo, less useful as a contrast).

## Plans

**Free**
- $0/month
- 100 CU-hours/month included compute
- 0.5 GB storage included
- Hard caps, no overage billing

**Launch** (pay-as-you-go, no monthly minimum)
- Storage overage: **$0.35/GB-month**
- Compute overage: **$0.106/CU-hour**

**Scale** (pay-as-you-go, no monthly minimum)
- Storage overage: **$0.35/GB-month**
- Compute overage: **$0.222/CU-hour**

## Shared facts

- Storage is "unlimited on paid plans" (metered, not capped).
- Both Launch and Scale include **500 GB/project** of public network egress, then **$0.10/GB**
  after that.
- Invoices under $0.50 are not collected (billing floor).

## Reading for our growth table

Our stand DB measured 49 MB for 3 tenants / 24 products / 6 orders
(`artifacts/docs/platform-measurements/2026-09-11-db-size.txt`) — at Neon's $0.35/GB-month that is
a few cents; the real cost driver at scale is compute (CU-hours), which this session did not
attempt to model against our RSS/CPU measurements (out of scope for a storage-focused DB-size
measurement). Use storage price as the input to §6 thresholds; flag compute pricing as a rough
input only.
