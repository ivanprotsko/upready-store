## Brief — task gw02-storefront-owner-faq — «FAQ владельца по витрине storefront: темы/пресеты/брендинг, аналитика, юр. ссылки, зоны доставки — 25+ вопросов по коду» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Write a Russian FAQ (at least 25 Q&A) for store owners about the storefront `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront`: theme and presets, owner branding (colors, fonts, logo — see `src/lib/theme`, `src/lib/profile`), analytics counters (see `src/lib/analytics` or grep «metrika|analytics»), legal links (`src/lib/util/legal-links.ts`), shipping zones/weight in checkout (grep «shipping»), languages ru/en (`messages/`). Each answer: 2–6 sentences, plain language, and a «Источник» line with the file path(s) the answer is derived from.

### Deliverables (write them INSIDE your working folder, relative paths)
- `faq.md — the FAQ grouped by topic`
- `coverage.md — table: topic → files read → number of questions`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
≥25 вопросов, у каждого ответа строка «Источник» с существующим путём; нет выдуманных функций (приёмщик выборочно откроет 5 источников). Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
