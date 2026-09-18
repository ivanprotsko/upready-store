## Brief — task gw14-medusa-owner-glossary — «Глоссарий понятий Medusa v2 для владельца (region, sales channel, stock location, fulfillment set, price list …) → наши русские термины и экраны панели» (gemini load wave, Ivan's order 2026-09-18 09:06 WITA; executor gemini-3.8-flash-high via agy)

You are the executor. Nobody answers questions; work alone to the result, inside your working folder only (see the hard rules above).

### Task
Build a glossary that maps Medusa v2 concepts to the owner's language and to our panel screens: region, sales channel, stock location, inventory item, fulfillment set/shipping option/shipping profile, price list, customer group, promotion/campaign, product variant/option, collection/category, order/fulfillment/payment collection, tenant (ours). For each term: Medusa definition with the docs.medusajs.com URL (network allowed for docs.medusajs.com only), the Russian term our UI uses (read `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src/i18n` and `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/messages`), where the owner meets it (panel route), a plain-language explanation for a non-technical owner, and mismatches (same concept named differently in two places).

### Deliverables (write them INSIDE your working folder, relative paths)
- `glossary.md — table + mismatches section`
- `sources/ — saved excerpts`
- `SUMMARY.md` — what was done, the deliverables with relative paths, what could not be done and why, every source used (path or URL), and your own count of facts checked.

### Sources and network
Network: only docs.medusajs.com. Never dev.wildberries.ru or docs.ozon.ru.
Facts come only from files you opened or pages you actually fetched in THIS run; write «не найдено» instead of guessing. Every factual claim carries its source (path or URL) next to it.

### Acceptance the acceptor (sonnet) will check
≥15 терминов; у каждого ссылка на docs.medusajs.com и путь к нашей строке i18n или пометка «в UI не встречается»; раздел разнобоя заполнен. Deliverables in Russian. No changes to the repository, no git commands that change state, no commits, no installs.

### Finish
Print `ARTIFACT: <absolute path>` for every deliverable (inside your working folder) and end with the line `RESULT: OK <one-line summary>` (or `RESULT: FAIL <reason>`).
