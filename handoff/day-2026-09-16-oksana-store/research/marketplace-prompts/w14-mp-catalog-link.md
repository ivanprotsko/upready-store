# One catalog: link marketplace cards to shop products by vendor code, show the differences, import photos and text one way

## What this is
Row 3 of the parity matrix (`research/marketplace-spec.md`, section 1): InSales Combo advertises «объединяйте
карточки с разных маркетплейсов» in one catalog. Our advantage is that the shop's SKUs ALREADY are the WB/Ozon vendor
codes of the same goods (`research/chrxnasdmds-digest.md`: «SKU уникальны (артикулы WB/Ozon либо PL-NN)»), so most of
the linking needs no human.

## The standing invariant (Ivan, 2026-09-16 02:46 WITA)
Read-only towards the marketplaces. Everything here writes to OUR database only. Importing a photo or a description
from a marketplace card INTO our product is a local write and is allowed; sending anything back is not, and this task
adds no such path.

## Sources
- `research/marketplace-spec.md` sections 2.3 (`mp_product`, `mp_offer`, `mp_link`) and 2.4 (linking rules).
- The core from `w12-marketplace-core`: `modules/marketplace/link.ts`, the `mp_*` models, the panel section.
- Existing product screens to copy the shape from: `apps/tenant-panel/src/routes/products/**`.
- Geist: `~/upready/packages/geist-kit/AGENTS.md`.
- Media rules: images never enter git; tenant uploads go through `apps/backend/src/tenant-files/`.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Screen «Маркетплейсы → Каталог»
One row per vendor code. Columns: article, shop product (name + link to its card), per marketplace — card title,
price, stock, photo present, link state. Four tabs with counts in the tab labels:
**связано** · **не найдено в магазине** · **нет на площадке** · **требует выбора**.
The four counts must sum to the total number of distinct vendor codes — put that arithmetic in the PR.

### 2. Linking
Auto-link exactly as spec 2.4 says: one match → `mp_link(matched_by='vendor_code')`; zero → «не найдено»; more than
one → **«требует выбора», never auto-linked**. Manual link and unlink write `matched_by='manual'`. A unit test covers
all three outcomes.
**Zero is not empty** (rule 20a): if `mp_product` has rows and `mp_link` has none, the screen says
«сопоставление не сработало: 0 из N» and names the absolute path of the source it checked — not «нет данных».

### 3. Differences
Computed from `mp_offer` and the shop's own price/stock: «цена магазин vs площадка» (absolute and %), «остаток магазин
vs площадка», «фото: магазин N / площадка M». A configurable threshold decides what is highlighted. Every number
carries a unit and a one-line hint of where it came from (rule 18e).

### 4. One-way import marketplace → shop
A button on a linked row imports the marketplace card's photos and description into the shop product. Rules:
a confirmation dialog listing exactly what will change; existing shop media is not deleted, imported media is added;
the imported text lands in the shop product's description field for the tenant's default locale; the action is
journalled (who, when, what) and is idempotent (running it twice does not duplicate photos — show that).
If the image host of the marketplace is not reachable, the row reports the failure and the rest of the import
continues — a swallowed failure must surface (rule 20a).

## Measurement (rule 18f) — the PR body quotes commands and outputs
1. `cd apps/backend && pnpm test:unit` → whole-file `ℹ fail 0`.
2. On the LOCAL stand for `cherkashino`: the four counts and the total, with the SQL that produced them.
3. The three linking outcomes demonstrated on real rows (one auto, one missing, one ambiguous) — screenshots.
4. The «0 из N» state forced (delete the links, reload) — screenshot, showing the absolute path in the message.
5. Import run: screenshots of the product card before and after, plus the second run proving idempotence
   (`select count(*)` of the product's media both times).
6. `select matched_by, count(*) from mp_link group by 1;`
Report: `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + the UI `report.json` per the preamble.

## Do not
Auto-link an ambiguous match. Delete shop media. Add any call that writes to a marketplace. Touch the live host.
