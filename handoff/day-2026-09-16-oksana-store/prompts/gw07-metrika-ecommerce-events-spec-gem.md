## Brief — task gw07-metrika-ecommerce-events-spec — «Спецификация событий электронной коммерции Яндекс.Метрики (dataLayer) для витрины: событие → триггер в коде → payload → файл» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Write a specification of Yandex.Metrika e-commerce events (dataLayer: detail/impressions, add, remove, purchase) for the storefront `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront`. Read the official spec at yandex.ru/support/metrica (ecommerce section; network allowed for yandex.ru/support only) and map each event to the real trigger in our code: product page view, add-to-cart, remove, checkout completion (grep «cart|checkout|order» in `src/app` and `src/lib`). Also describe what analytics wiring already exists (grep «metrika|ym(|dataLayer|gtm»). Table: event → trigger (user action) → where in code (file:line) → payload fields and their source → open questions. Do not implement.

### Deliverables (write them INSIDE your working folder, relative paths)
- `metrika-ecommerce-spec.md`
- `sources/ — saved excerpt of the Metrika spec`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: only yandex.ru/support. Never dev.wildberries.ru or docs.ozon.ru.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
все 4 базовых события описаны с file:line триггеров; payload по официальной спецификации; раздел «что уже есть» по коду. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
