# One price and stock table: the shop and every marketplace in a single screen, differences highlighted

## What this is
Row 4 of the parity matrix (`research/marketplace-spec.md`, section 1). InSales Combo advertises «цены и остатки всех
площадок правятся в одной таблице» and «единый остаток». In our read-only frame the table is the same table minus the
editing: we SHOW the shop's numbers next to each marketplace's numbers and we point at the differences. Oksana asked
for stock synchronisation in her own words (`research/gap-matrix.md`, message #472253) — this is the half of it that
is possible today, and the report must say plainly which half is missing and why (spec section 4).

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only. **There is no editing of marketplace prices or stocks on this screen in any form** — no inline edit, no
bulk action, no "push to marketplace". Prove it with a test that no handler reaches a mutating endpoint id.

## Sources
- `research/marketplace-spec.md` section 2.3 (`mp_offer` — why price and stock live per warehouse and per size) and
  section 1 row 4.
- The core from `w12-marketplace-core` and the links from `w14-mp-catalog-link`.
- WB: prices `GET /api/v2/list/goods/filter` (discounts-prices-api), stocks `POST /api/v3/stocks/{warehouseId}`
  (a documented read-with-a-body — `PUT` on the same path is "Update Inventory" and `DELETE` is "Delete Inventory";
  neither is registrable), warehouses `GET /api/v3/warehouses`.
- Ozon (if `w11` merged): `POST /v5/product/info/prices`, `POST /v4/product/info/stocks`, `POST /v2/warehouse/list`.
- Geist: `~/upready/packages/geist-kit/AGENTS.md`.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Screen «Маркетплейсы → Цены и остатки»
One row per vendor code. Columns grouped: **магазин** (price, stock) · **WB** (price, discount price, stock) ·
**Ozon** (price, stock). A row expands into its warehouses and sizes from `mp_offer`. The collapsed stock number must
equal the sum of the expanded ones — demonstrate that on a concrete article in the PR, with both numbers.

### 2. Differences
Price difference in absolute money and in percent; stock difference in units. A configurable threshold decides
highlighting, and the threshold is shown on screen. Every number carries its unit, and the column header says what the
number is (rule 18e) — «цена на WB, ₽ с учётом скидки», not «WB».

### 3. The four groups
Tabs with counts: **везде есть** · **есть в магазине, нет на площадке** · **есть на площадке, нет в магазине** ·
**расхождение выше порога**. The counts of the first three sum to the total number of distinct vendor codes; put that
arithmetic in the PR.

### 4. Freshness
Each marketplace column carries the `measured_at` of the data it shows. Stale data (older than the kind's interval
times three) is marked stale rather than shown as current — a number whose age is hidden is a number that lies.

### 5. Export
CSV of exactly the filtered set; row count of the file equals the on-screen count, both quoted in the PR.

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. On the LOCAL stand for `cherkashino`: the counts of the four groups plus the total, with the SQL.
3. The sum-of-warehouses check on one concrete article: the expanded rows and the collapsed number.
4. The read-only test output (no handler reaches a mutating endpoint id).
5. Screenshots: the table, an expanded row, the «расхождение» tab, a stale marker.
6. `wc -l` of the export next to the screen count.
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble. The report
states, in one sentence, that pushing stock back to the marketplaces is phase 4 and why it is not here.

## Do not
Add an edit control for a marketplace value. Show a stale number as fresh. Touch the live host.
