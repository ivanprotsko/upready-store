## Brief — task gw04-delivery-services-rf — «Исследование: службы доставки РФ для малого магазина (СДЭК, Boxberry, Яндекс Доставка, Почта России, 5Post) — тарифная модель, ПВЗ, API, интеграция» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Compare delivery services for a small Russian online store: СДЭК, Boxberry, Яндекс Доставка, Почта России, 5Post, DPD (and up to 2 more). For each: pricing model (weight/zone), pick-up point network size, courier delivery, API availability and auth model, contract requirements for ИП/самозанятый, cash-on-delivery, tracking, widget for checkout. Relate to our checkout shipping zones/weight (read `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src` — grep «shipping_option|shipping-zone|weight» — describe what exists, do not change code). Recommend 2 services to integrate first and why.

### Deliverables (write them INSIDE your working folder, relative paths)
- `report.md — table + recommendation`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
таблица ≥6 служб; у каждой строки первоисточник; раздел «что уже есть в коде» с путями. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
