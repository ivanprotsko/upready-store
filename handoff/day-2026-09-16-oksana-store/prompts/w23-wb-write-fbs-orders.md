# {{TASK_ID}} — WB FBS orders desk: new orders mirror (read) + assembly status actions (write class "fbs_orders") through the write core, dry-run. NO live write.

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` from `{{BASE}}`. Requires merged w20 (write core) and w01 (read module, registry `marketplace.*` entries, `wb_order` from statistics).

Ivan's order of 2026-09-16 04:44 WITA: «заведи все задачи, и для каждой укажи есть ли такой функционал у конкурентов. Сразу проектируй все так, чтобы проверять есть ли аналогичные функции для озон…». Invariant of 02:46: nothing is sent to WB; status changes end as dry-run audit rows.

## Competitor — YES
InSales Combo: «Схемы FBS, FBO, DBS — поддержка всех трёх схем» (research/insales-combo-features.md line 194, https://www.insales.ru/page/combo); «единая лента заказов с печатью этикеток» (line 327, https://www.insales.ru/page/combo).

## Build
1. READ side (in the read module, registry with docUrl): FBS new orders (`marketplace` host, "orders/new"), orders list with statuses, order statuses endpoint, supplies list; mirror `wb_fbs_order` (order id, created_at, status/supplier_status, nm_id, article, price, warehouse, delivery type, raw) and `wb_supply`; sync kinds `fbs_orders`, `supplies`. The stickers endpoint is a POST that returns labels — register it as a read ONLY if the docs say it changes nothing; otherwise leave it for the write class.
2. WRITE side (registry in `write-endpoints.ts`, class `fbs_orders`): confirm/assemble, cancel, add to supply, close supply — method+path+body from the docs (saved copies / Ivan's browser as in w20).
3. Panel «Заказы FBS» tab: new orders first, columns per the mirror, actions «Собрать» / «Отменить» → confirmation dialog → `wbWrite` (dry-run today) → audit; the disabled live-send explanation as in w21.
4. Tests: mirror sync with recorded fixtures; action → dry-run audit row, 0 fetches; illegal transitions rejected.

## Measurements for the PR
Local stand: `select count(*) from wb_fbs_order`, `wb_sync_run` rows (respect the documented limits; a 429 is recorded, not retried in a loop); screenshots of the tab; audit rows; Ozon analogue: FBS posting methods (list/ship/cancel/labels) from https://docs.ozon.ru/api/seller/ with URLs, or «не найдено». `git grep -n "eyJhbGci" -- .` empty. Report per the preamble.
