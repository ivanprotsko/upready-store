# Source https://www.hetzner.com/cloud/, https://www.hetzner.com/cloud/cost-optimized/, https://www.hetzner.com/cloud/regular-performance/, https://docs.hetzner.com/cloud/servers/overview/
# Fetched 2026-09-11T00:00:00Z (session clock; see task metadata for exact run time)
# Topic: Hetzner Cloud server specs (CX/CAX/CPX) and IP pricing

## What was actually retrievable

Hetzner's marketing pricing pages render EUR prices via client-side JavaScript; a plain HTML
fetch (this session used WebFetch, six different URLs including the docs subdomain) consistently
returns literal placeholder text ("starting from max/mo", "Price not displayed") where the number
belongs, even though the specs tables around them are present. No Hetzner Cloud API token exists
in `~/upready/.env.keys` to query the authenticated pricing API instead. **Live EUR figures for
Hetzner are NOT fetched** — treat any Hetzner monthly price in this spec's growth table as "read
off the calculator at hetzner.com/cloud on the day Ivan decides", not as a number this session
measured.

## Facts that DID come through (specs, cost-optimized line — /cloud/cost-optimized/)

| Plan  | vCPU | RAM   | Disk        | Processor |
|-------|------|-------|-------------|-----------|
| CX23  | 2    | 4 GB  | 40 GB NVMe  | Intel/AMD |
| CAX11 | 2    | 4 GB  | 40 GB NVMe  | Ampere    |
| CX33  | 4    | 8 GB  | 80 GB NVMe  | Intel/AMD |
| CAX21 | 4    | 8 GB  | 80 GB NVMe  | Ampere    |
| CX43  | 8    | 16 GB | 160 GB NVMe | Intel/AMD |
| CAX31 | 8    | 16 GB | 160 GB NVMe | Ampere    |
| CX53  | 16   | 32 GB | 320 GB NVMe | Intel/AMD |
| CAX41 | 16   | 32 GB | 320 GB NVMe | Ampere    |

All cost-optimized plans: 20 TB included traffic for EU locations, extra traffic billed per TB at
EU-Central.

## Facts that DID come through (specs, regular-performance line — /cloud/regular-performance/)

EU/AP region:

| Plan  | vCPU | RAM   | Disk        |
|-------|------|-------|-------------|
| CPX12 | 1    | 2 GB  | 40 GB NVMe  |
| CPX22 | 2    | 4 GB  | 80 GB NVMe  |
| CPX32 | 4    | 8 GB  | 160 GB NVMe |
| CPX42 | 8    | 16 GB | 320 GB NVMe |
| CPX52 | 12   | 24 GB | 480 GB NVMe |
| CPX62 | 16   | 32 GB | 640 GB NVMe |

US region (different specs from EU for the same plan names — measured, not assumed equal):

| Plan  | vCPU | RAM   | Disk        |
|-------|------|-------|-------------|
| CPX11 | 2    | 2 GB  | 40 GB NVMe  |
| CPX21 | 3    | 4 GB  | 80 GB NVMe  |
| CPX31 | 4    | 8 GB  | 160 GB NVMe |
| CPX41 | 8    | 16 GB | 240 GB NVMe |
| CPX51 | 16   | 32 GB | 360 GB NVMe |

Billing model: hourly while running, monthly price acts as a cap ("your server's bill will never
exceed its monthly price cap"); deletion prorates the charge.

## The one real price this session got (docs.hetzner.com/cloud/servers/overview/)

- Primary IPv4: **€0.50/month** (excl. VAT).
- Primary IPv6: **free** (not charged).

## Volumes and Load Balancer pricing

Not retrieved — same JS-rendering problem, and no dedicated docs page with numbers was found in
the time budget for this task. Not invented.

## What to do with this in the spec

Use Hetzner for its **specs** (CX23/CX33/CX43 as the vCPU/RAM/disk ladder) and its one confirmed
number (IPv4 rental). For monthly EUR totals, either point Ivan at the live calculator or use
Contabo's confirmed, server-rendered prices (source-2) as the priced baseline, flagging Hetzner
rows as "specs real, price unverified tonight".
