# Source https://contabo.com/en/vps/
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Contabo Cloud VPS pricing (the provider that already hosts our stands)

This is the same provider that already runs the five `*.upready.dev` stands and `agent-creatr`
(`~/upready/memory/agent-creatr-prod-deploy-contabo.md`, `~/upready/memory/stands-deploy-decisions-2026-09-09.md`)
— so these numbers are directly comparable to the host we already operate, not a cold quote.

## Cloud VPS plans (effective monthly rate, 24-month subscription, incl. VAT — page's own framing)

| Plan         | vCPU | RAM   | Storage      | Traffic   | Price/month (EUR) |
|--------------|------|-------|--------------|-----------|--------------------|
| Cloud VPS 4  | 4    | 8 GB  | 100 GB SSD   | Unlimited | €5.50              |
| Cloud VPS 6  | 6    | 12 GB | 200 GB SSD   | Unlimited | €7.50              |
| Cloud VPS 8  | 8    | 24 GB | 300 GB SSD   | Unlimited | €14.00             |
| Cloud VPS 12 | 12   | 48 GB | 400 GB SSD   | Unlimited | €25.00             |
| Cloud VPS 16 | 16   | 64 GB | 500 GB SSD   | Unlimited | €37.00             |
| Cloud VPS 18 | 18   | 96 GB | 600 GB SSD   | Unlimited | €49.00             |

Notes:
- "Unlimited traffic" is subject to a fair-use policy at exceptionally high usage.
- Storage extension is available as an add-on for all plans.
- Port speed scales with plan: 200 Mbit/s on the entry plan up to 1 Gbit/s on the top tiers.
- Auto Backup is an optional add-on (not priced on this page).
- Pricing is the *effective* (amortized 24-month) rate; a shorter commitment costs more per month
  — not captured by this fetch, re-check the calculator if Ivan wants a 1- or 12-month figure.

## Cross-check against our own live host

The Contabo box already running our five stands plus `agent-creatr`/`bpj-dev`/`verdaccio`
measured `free -m` → 11 960 MB total RAM (`deploy/README.md`, "Stand one — measured 2026-09-10"),
which lines up with a Cloud VPS in the 12 GB class (Cloud VPS 8, 24 GB, is close but the 24 GB
figure doesn't match either — the host may be an older/custom plan predating this exact ladder, or
a different tier; not reconciled further, flagged as an open point in "Пороги"/"Развилка").
