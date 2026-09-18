## Brief — task gw12-backend-api-docs-digest — «Дайджест собственных API-маршрутов backend (apps/backend/src/api): маршрут → метод → авторизация → payload → файл — для разработчиков панели» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Document the custom API routes of the Medusa backend `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api` (all subfolders; skip node_modules). For each route file: HTTP methods, path (from the folder structure), auth/middleware applied (read `middlewares.ts` files), request body/query schema (zod or manual validation), response shape, which app calls it (grep the path in `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src` and `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src`), file path. Output Russian docs: one table per area (tenants, domains, legal, analytics, …) plus an «открытые вопросы» section for routes whose auth or shape is unclear.

### Deliverables (write them INSIDE your working folder, relative paths)
- `api-digest.md`
- `routes-index.tsv — path	methods	auth	file`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
каждый файл route.ts под src/api представлен строкой; методы и авторизация сверены с кодом (приёмщик проверит 8 случайных). Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
