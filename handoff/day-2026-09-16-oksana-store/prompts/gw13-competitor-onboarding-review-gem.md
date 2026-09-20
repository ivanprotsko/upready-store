## Brief — task gw13-competitor-onboarding-review — «Исследование: первые 10 минут владельца у Tilda, InSales, Shopify, Ecwid — шаги онбординга по официальным справкам, выводы для start.upready.dev» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Review how Tilda, InSales, Shopify and Ecwid onboard a new store owner in the first session, using only their official help centers / docs / public pages (help.tilda.cc, insales.ru docs, help.shopify.com, support.ecwid.com): steps, what is asked first, defaults, templates, first-sale checklist, trial/paywall moments. Then read our onboarding wizard (grep «onboarding» under `/Users/ivanprotsko/upready/projects/upready-store/apps/homepage` and `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src`) and produce: comparison table (step → each competitor → ours), 10 concrete recommendations ordered by expected impact, each with the competitor source and the file in our code it would touch (describe, do not implement).

### Deliverables (write them INSIDE your working folder, relative paths)
- `report.md — table + recommendations`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
сравнение по 4 конкурентам из официальных справок с ссылками; раздел «наш мастер» по коду с путями; рекомендации конкретны и приоритизированы. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
