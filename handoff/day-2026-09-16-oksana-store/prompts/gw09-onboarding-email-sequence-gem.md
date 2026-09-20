## Brief — task gw09-onboarding-email-sequence — «Тексты серии из 5 онбординг-писем новому владельцу магазина (RU) по реальному потоку start.upready.dev и существующим письмам backend» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Write a 5-letter onboarding email sequence in Russian for a new store owner who just created a store via the onboarding wizard. First read the real flow and vocabulary: onboarding pages (grep «onboarding» under `/Users/ivanprotsko/upready/projects/upready-store/apps/homepage` and `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src`), existing email templates and their i18n (`/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/emails`), and the panel screens (`/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src/app`). Letters: day 0 welcome + first 3 steps, day 1 products & photos, day 3 delivery & payment, day 5 legal pages & receipts, day 7 first sales & analytics. Each: subject (2 variants), preheader, body 120–220 words, one CTA with the real panel route, plain-language tone for a 35–45 y.o. non-technical owner. Only features that exist in code; mark anything uncertain «(уточнить)».

### Deliverables (write them INSIDE your working folder, relative paths)
- `emails.md — 5 letters`
- `facts.md — table: claim in letters → file path proving the feature exists`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
5 писем с темами и CTA на реальные маршруты панели; facts.md подтверждает каждую упомянутую функцию путём; стиль — простой русский. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
