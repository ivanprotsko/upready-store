## Brief — task gw08-telegram-mini-app-store-research — «Исследование: Telegram Mini App для магазина — платежи (Payments/Stars/провайдеры РФ), авторизация initData, ограничения, примеры» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Research Telegram Mini Apps for an online store from official sources (core.telegram.org/bots/webapps, core.telegram.org/bots/payments, telegram.org/blog): payments options and which work for Russian sellers (Telegram Payments providers list, Stars, external payment links policy), user auth via initData validation, storage/limits, deep links, UI constraints (theme params, viewport), publishing requirements. Add 3–5 documented store examples (public case studies). Relate to our repo: what exists in `/Users/ivanprotsko/upready/projects/upready-store/apps/bot` (read it, describe, do not change). Output a decision table: capability → available for RF store? → source → implication for our Mini App.

### Deliverables (write them INSIDE your working folder, relative paths)
- `report.md`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
каждое утверждение о возможностях Telegram — со ссылкой на core.telegram.org; раздел про apps/bot по коду; таблица решений заполнена. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
