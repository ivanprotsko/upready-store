# One order feed: shop + Wildberries + Ozon in a single table, filters, order card, CSV export

## What this is
Rows 2, 6, 7 and 21 of the parity matrix (`research/marketplace-spec.md`, section 1). Oksana asked for this in her own
words — «единая панель заказов WB + Ozon + магазин» (`research/gap-matrix.md`, message #468851). InSales Combo sells
the same thing as «единая лента заказов площадок».

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only. The screen SHOWS marketplace orders; it never changes them. No "accept", no "ship", no "print label", no
status change on the marketplace side. Confirm that with a test, not with a promise.

## Sources
- `research/marketplace-spec.md` section 2.3 (`mp_order`, `mp_order_line`), section 1 rows 2/6/7/21.
- WB reads (already registered or to be added to the WB registry with their doc citation):
  `GET /api/v3/orders/new` and `GET /api/v3/orders` (assembly orders, marketplace-api),
  `POST /api/v3/orders/status` (statuses of a batch of orders),
  `GET /api/v1/supplier/orders` and `GET /api/v1/supplier/sales` (statistics-api, all schemes, 90-day retention;
  note the measured 120 s timeout on the orders call recorded in `modules/wb/endpoints.ts`),
  `GET /api/v1/claims` (buyer return applications).
  Saved copies: `artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt` and the w01 `reports`
  page.
- Ozon reads (only if `w11` has merged): `POST /v4/posting/fbs/list`, `POST /v3/posting/fbo/list`,
  `POST /v3/posting/fbs/get`, `POST /v1/returns/list`. Saved copy: `docs.ozon.ru-api-seller-index.txt`,
  index `ozon-methods-index.tsv`.
  **Careful**: `/v3/posting/fbs/list` and `/v2/posting/fbo/list` are deprecated (switch-off dates on the page) —
  register the current versions.
- Existing order screens to copy: `apps/tenant-panel/src/routes/orders/**`. Geist only.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Import of marketplace orders into `mp_order` / `mp_order_line`
New sync kinds where needed, each with its `mp_sync_run` row. Map to the normalized columns of spec 2.3, including
`scheme` (`FBS | FBO | DBS | rFBS`) — take the scheme from the endpoint the row came from, not from a guess.
Statuses stay the marketplace's own strings in `status`, plus a small mapping to a common set for the filter; the raw
string is always shown in the order card so nothing is lost in translation.

### 2. Screen «Маркетплейсы → Заказы»
One table with shop orders (Medusa) and marketplace orders side by side, a source column, and filters:
marketplace · scheme · status · period. Filters are reflected in the URL so a state can be shared.
Sorting by date; the default period is the last 30 days and the screen SAYS so.
An empty result says «за выбранный период заказов нет» and names the period — never a blank table (rule 20a).

### 3. Order card
Line items (`mp_order_line`) with the shop product link through `mp_link` where it exists, warehouse, region, sums,
currency, status history. A line whose vendor code has no shop product shows the code and «нет в магазине».

### 4. CSV export
Exports exactly the filtered set. The PR proves it: the number of rows in the file equals the number of rows on the
screen, both quoted.

### 5. The read-only proof
A test that walks the screen's handlers and asserts none of them calls an adapter with a mutating endpoint id, plus
the absence of any action button in the rendered markup for a marketplace order.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. On the LOCAL stand for `cherkashino`: the sync run, then
   `select marketplace, scheme, count(*) from mp_order group by 1,2 order by 1,2;`
3. `select marketplace, kind, status, rows, requests from mp_sync_run order by started_at desc limit 10;`
4. Screenshots: the feed with filters applied, an order card, the empty-period state.
5. CSV: `wc -l` of the exported file next to the on-screen count.
6. `select endpoint_id, method, count(*) from mp_api_call where marketplace in ('wb','ozon') group by 1,2;` —
   every row is a registered read.
7. If Ozon has no key yet: one line saying so, and the Ozon columns rendered as «нет подключения», not as zeros.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Add a button that changes anything on a marketplace. Register a deprecated method. Report a zero as «нет заказов» when
the sync failed — a failed run is a red row, not an empty table. Touch the live host.
