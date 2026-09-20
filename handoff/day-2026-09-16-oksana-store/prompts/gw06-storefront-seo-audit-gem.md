## Brief — task gw06-storefront-seo-audit — «SEO-аудит витрины storefront по коду: metadata, sitemap/robots, schema.org Product/Offer, hreflang ru/en, canonical — находки и чек-лист» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Audit the Next.js storefront `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront` for SEO by reading code: generateMetadata usage per route, sitemap/robots (grep «sitemap|robots»), structured data (grep «schema.org|application/ld+json»), hreflang/alternates for ru/en, canonical URLs, Open Graph, image alt texts on product pages, 404/redirect handling. Reference the official guidance (developers.google.com/search/docs, schema.org/Product) — network allowed for these two hosts only. Findings: table check → status (ok/partial/missing) → file:line → recommended change (describe, do not implement).

### Deliverables (write them INSIDE your working folder, relative paths)
- `seo-audit.md — findings table + top-10 priorities`
- `sources/ — saved excerpts of the guidance used`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: only developers.google.com and schema.org. Never dev.wildberries.ru or docs.ozon.ru.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
каждая находка привязана к file:line; статусы проверяемы (приёмщик откроет 5 из них); нет правок кода. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
