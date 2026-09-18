## Brief — task gw05-legal-docs-rf-checklist — «Чек-лист юридических требований к интернет-магазину РФ (152-ФЗ, ЗоЗПП, ПП 2463, оферта, возвраты, cookies) и аудит наших шаблонов tenant-legal» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Build a checklist of legal requirements for a Russian online store: personal data (152-ФЗ: policy, consent, operator registration in РКН), consumer protection for distance selling (ЗоЗПП ст. 26.1, ПП РФ № 2463 — mandatory information on the site, return/refund terms), public offer, cookies/analytics consent, receipts (54-ФЗ), self-employed specifics. Cite the article/paragraph for every item from publication.pravo.gov.ru or consultant.ru. Then audit our templates in `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/tenant-legal` and `/Users/ivanprotsko/upready/projects/upready-store/apps/homepage/port/plugins/legal-pages.ts` against the checklist: table item → present/absent/partial → file:line → what to add. Do not change code.

### Deliverables (write them INSIDE your working folder, relative paths)
- `checklist.md — requirements with citations`
- `audit.md — findings table against our templates`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: allowed — open public primary sources (official sites, official docs, laws at publication.pravo.gov.ru / consultant.ru). Never dev.wildberries.ru or docs.ozon.ru. Save every web source you rely on as a local excerpt (text, ≤200 lines) under `sources/` in your working folder, named after the host.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
каждый пункт чек-листа со ссылкой на статью закона; аудит покрывает все файлы tenant-legal; нет юридических утверждений без источника. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
