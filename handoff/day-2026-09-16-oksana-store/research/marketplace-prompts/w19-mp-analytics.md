# Seller dashboard: sales by day and by card, ABC/XYZ, turnover, days-to-zero, seller rating — and an honest P&L

## What this is
Rows 14, 15, 16, 17, 19 and 20 of the parity matrix (`research/marketplace-spec.md`, section 1). Seller analytics is
the main argument of the competitor's «Комбо» and «Селлер» lines: P&L, turnover, ABC/XYZ, sales reports, stock-shortage
alerts. Most of it we compute OURSELVES from the mirror; one part we honestly cannot.

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only. Analytics reads the local `mp_*` tables and, where needed, registered analytics endpoints. Nothing is sent.

## The part we cannot do, and how to say it
A full P&L needs WB's finance category. **Oksana's WB key does not have it**: bit 13 «Access to Finance» is not set and
`finance-api` answered 403 (`research/wb-plan.md`, and the bit table in `research/marketplace-spec.md` section 0).
So either there is no P&L block, or it is present and labelled
«неполный: нет доступа к категории Finance у ключа WB (бит 13 не выставлен, finance-api отвечает 403)».
**No invented numbers, no estimated margin.** On Ozon, `POST /v1/finance/cash-flow-statement/list` and
`POST /v1/finance/realization/by-day` exist but several finance reports require Premium Plus/Pro — record what the
cabinet actually answers once a key exists, or write «ключа ещё нет».

## Sources
- `research/marketplace-spec.md` sections 1 (rows 14–20) and 2.3.
- WB analytics reads, from `artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-analytics.txt`
  (host `seller-analytics-api.wildberries.ru`): `POST /api/analytics/v3/sales-funnel/products`,
  `POST /api/analytics/v3/sales-funnel/products/history`, `POST /api/analytics/v3/sales-funnel/grouped/history`,
  `POST /api/v2/stocks-report/products/products`, `POST /api/v2/stocks-report/offices`,
  `POST /api/analytics/v2/item-rating`. **The `/api/v2/search-report/*` family needs a Jam subscription** — check
  before registering, and write down what the cabinet answers.
  Sales and orders themselves: `GET /api/v1/supplier/sales`, `GET /api/v1/supplier/orders` (statistics-api).
- Ozon (if `w11` merged): `POST /v1/analytics/data` (**at most once per minute**; without Premium Plus only 3 months
  of history and restricted groupings), `POST /v1/analytics/stocks` (days-to-zero), `POST /v1/analytics/turnover/stocks`,
  `POST /v1/rating/summary`, `POST /v1/rating/history`.
- Geist: `~/upready/packages/geist-kit/AGENTS.md`.

- **`w03-wb-sales-questions-mirror`** (queued 04:44) brings the WB seller-analytics funnel into the mirror.
  Read it through `mp_*`; do not re-import it here.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Screen «Маркетплейсы → Аналитика»
Period picker (default: last 30 days, stated on screen). Blocks:
- **продажи по дням** — a chart, plus the underlying table;
- **продажи по карточкам** — revenue, units, average price, per marketplace and total;
- **ABC по выручке** and **XYZ по стабильности спроса** — computed by us from `mp_order`; the formula is printed on
  screen in one line so the number can be argued with;
- **оборачиваемость** and **дней до нуля** — from `mp_offer` stock and the sales rate; the source of each is named;
- **рейтинг продавца** — from the marketplace's own rating endpoints, per marketplace;
- **P&L** — as described above, or absent.

### 2. Every number is readable (rule 18e)
Number + unit + what it means. No raw enum on screen. A derived block carries a one-line hint of what it is derived
from. A period with no sales says «за выбранный период продаж нет» and names the period — not an empty chart.

### 3. Correctness is proven, not asserted
For at least three numbers on the screen (total revenue, units, one card's revenue) the PR shows the screen value and
a direct SQL over `mp_order` / `mp_order_line` giving the same value. Two of your own versions of a metric differing
by a factor is evidence of an unread schema, not a choice for the reader (rule 17a).

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. The three screen-vs-SQL comparisons, both outputs side by side.
3. `select marketplace, kind, status, rows from mp_sync_run order by started_at desc limit 10;`
4. Screenshots: the dashboard, the empty-period state, the P&L label (or its absence explained).
5. Whatever the analytics endpoints actually answered, including refusals, quoted verbatim.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Estimate a margin you cannot compute. Register a subscription-gated endpoint without recording what the cabinet
answers. Call `/v1/analytics/data` more than once a minute. Touch the live host.
