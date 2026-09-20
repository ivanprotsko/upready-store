## Brief — task gw10-ui-strings-audit-ru — «Аудит русских UI-строк storefront и tenant-panel: опечатки, разнобой терминов, ё/регистр — таблица ключ → сейчас → предложение → причина» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Audit the Russian UI strings in `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/messages` and `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src/i18n` (and `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/admin/i18n` if it has ru). Find: typos, inconsistent terms for the same thing (корзина/заказ/доставка/оплата/товар/вариант), inconsistent capitalization and punctuation, untranslated English, placeholders mismatched between ru and en, overly technical wording for a buyer/owner. Output a table: file → key → current → proposed → reason (one of: опечатка / термин / регистр / англицизм / плейсхолдер / стиль). Do NOT edit the repository files — the table is the deliverable. Finish with a terms glossary (RU term chosen → variants seen → where).

### Deliverables (write them INSIDE your working folder, relative paths)
- `ui-strings-audit.md — table + glossary + counts per category`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: NOT needed and not allowed — the facts are in the repository files named below; read them by absolute path.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
≥40 строк в таблице с существующими ключами (приёмщик проверит 10 случайных); файлы репозитория не изменены. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
