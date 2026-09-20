## Brief — task gw01-tenant-panel-owner-guide — «Руководство владельца магазина по панели tenant-panel (по коду, для нетехнического владельца)» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Write an owner's guide (Russian) to the store owner panel `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel`. Read the routes in `src/app` (every page directory), the Russian UI strings in `src/i18n`, and the components each page renders. For EVERY screen write: what it is for, each setting/field in plain language (what changes for the buyer), typical mistakes. Structure: one section per screen in navigation order, a table of contents, a «первые 30 минут» quick start.

### Deliverables (write them INSIDE your working folder, relative paths)
- `owner-guide.md — the guide`
- `screens-index.md — table: route → screen title (RU) → source files → covered in section`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
каждый маршрут src/app панели имеет раздел; ни одной функции, которой нет в коде (у каждого утверждения — путь к файлу); язык — простой русский без жаргона разработчика. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
