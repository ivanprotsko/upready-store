## Brief — task gw03-payment-providers-rf — «Исследование: платёжные провайдеры РФ для малого интернет-магазина (Robokassa, ЮKassa, CloudPayments, Т-Банк, Сбер) — комиссии, подключение ИП/самозанятые, чеки 54-ФЗ, выплаты» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Compare payment providers for a small Russian online store (owner: individual entrepreneur or self-employed): Robokassa, ЮKassa, CloudPayments, Т-Банк (Tinkoff) Касса, СберPay/Сбер эквайринг, and up to 3 more you find. For each: fees by turnover tier, connection requirements (ИП/самозанятый/ООО), online-receipt (54-ФЗ) options and their price, payout terms, СБП support, test mode/API docs link, subscription/recurring support. Then a recommendation for a store on Medusa with Robokassa already integrated (see `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src` — grep «robokassa» — to describe what exists; do not change code).

### Deliverables (write them INSIDE your working folder, relative paths)
- `report.md — comparison table + recommendation + open questions`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
таблица ≥6 провайдеров с ценами и датой снятия; каждая цена — со ссылкой на первоисточник; рекомендация опирается на факты из кода (что уже подключено). Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
