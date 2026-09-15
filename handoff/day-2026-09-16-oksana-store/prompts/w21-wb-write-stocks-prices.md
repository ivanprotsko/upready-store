# {{TASK_ID}} — WB write, class "stocks" and "prices": store → WB diff, preview, dry-run push through the write core. NO live write.

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Requires merged w20 (`apps/backend/src/modules/wb-write/`, gates, audit, consent) and w01 mirrors `wb_stock`, `wb_price`, `wb_product`, plus the product↔WB link table from w07 (`product_marketplace_link`; if w07 is not merged yet, match by `product_variant.sku = wb_product.vendor_code` and say so).

Ivan's order of 2026-09-16 04:44 WITA: «заведи все задачи, и для каждой укажи есть ли такой функционал у конкурентов. Сразу проектируй все так, чтобы проверять есть ли аналогичные функции для озон…». Invariant of 02:46: nothing is written to WB; this task ends in dry-run audit rows.

## Competitor — YES
InSales Combo: «Товарный учёт и остатки — синхронизация с площадками» (research/insales-combo-features.md line 91, https://www.insales.ru/page/combo); «Единый остаток и таблица цен» (line 197, https://www.insales.ru/page/marketplace).

## Build
1. Registry entries in `write-endpoints.ts` for: stock update per warehouse and price/discount upload — the exact method+path+body from the WB docs (saved copies in `artifacts/docs/w01-wb-readonly-client/docs/`, or Ivan's browser: Playwright `channel:'chrome'`, headed, scratchpad profile, no cabinet login), each with `docUrl` and `bodySchema`. Nothing from memory.
2. Diff service: for each linked variant, store stock per WB warehouse (map store stock locations ↔ `wb_stock.warehouse_id`; unmapped → skipped and listed) and store price (RUB) vs `wb_price`; output rows {variant, nm_id, field, store value, wb value, action}.
3. Script `pnpm --filter backend wb:push -- --tenant cherkashino --kind stocks|prices --dry-run` (dry-run is the only mode possible without the gates): builds the documented request bodies in batches of the documented size, calls `wbWrite` → audit rows with `dry_run=true`.
4. Panel: «Что изменится на WB» preview table (stocks, prices) with counts and a disabled «Отправить» button explaining the gates that are closed.
5. Tests: diff correctness on fixtures; batch size limits; dry-run produces N audit rows and 0 fetches.

## Measurements for the PR
Diff table on the local stand (counts: equal / differ / unmapped); audit rows of the dry-run; screenshot; Ozon analogue: methods for stock and price update from https://docs.ozon.ru/api/seller/ with URLs or «не найдено». `git grep -n "eyJhbGci" -- .` empty. Report per the preamble.
