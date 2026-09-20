## Brief — task gw11-storefront-e2e-test-plan — «Каталог e2e-сценариев витрины (каталог → корзина → оформление → оплата) по коду и существующим Playwright-тестам: пробелы, приоритеты — план без кода» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.1-pro-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Build an end-to-end test scenario catalogue for the storefront `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront`: read the routes in `src/app`, the cart/checkout code (grep «cart|checkout|payment|shipping»), and the EXISTING tests (find «*.spec.ts|*.test.ts|playwright» under apps/storefront and the repo root, excluding node_modules). For every user flow list scenarios (happy path, validation errors, empty states, ru/en, guest vs logged-in, mobile viewport), mark each as covered / partially / not covered by an existing test (name the test file), assign priority P0–P2 with a one-line reason. No code — the plan is the deliverable.

### Deliverables (write them INSIDE your working folder, relative paths)
- `e2e-test-plan.md — catalogue with coverage and priorities`
- `existing-tests-index.md — table: test file → what it checks`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
покрытие сверено с реальными файлами тестов (каждый названный тест существует); ≥30 сценариев; приоритеты обоснованы. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
