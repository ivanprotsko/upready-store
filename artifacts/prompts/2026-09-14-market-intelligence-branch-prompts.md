# Стартовые промпты веток market intelligence

Задача `t-2026-09-14-03` · 2026-09-14 · ветки описаны в `artifacts/docs/2026-09-14-market-intelligence-roadmap.md`.
**Ни одна ветка не заведена.** Промпты ждут команды Ивана.

Промпты написаны по-английски (правило 3a). Перед каждым — строка запуска воркспейса (s8: одна задача = один воркспейс = одна ветка от `dev` = один PR в `dev`).

Порядок, который предлагает дорожная карта: **B1 → B2 ‖ B3 → B4 → (B5 → B6 → B7) ‖ B8 ‖ B9**.

Перед запуском любой ветки проверить, что развилки раздела 13 отчёта, от которых она зависит, закрыты Иваном (таблица «Внешние зависимости» в дорожной карте).

---

## B1 `feat/mi-core`

```
superset ws create --local --project upready-store --branch feat/mi-core --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the market-intelligence core branch in the upready-store repo. Your workspace is a fresh worktree on branch feat/mi-core, forked from dev. Work only there.

READ FIRST, in this order: artifacts/research/2026-09-14-market-intelligence/report.md (sections 2, 4, 6, 9, 10), specs/market-intelligence/storage-model.md, specs/market-intelligence/collection-policy.md, then AGENTS.md and CLAUDE.md in the repo root.

BUILD the foundation of the watching engine as a Medusa 2 module at apps/backend/src/modules/market-intelligence. Nothing about extraction, diffing, notifications or UI belongs in this branch.

1. The seven models of specs/market-intelligence/storage-model.md, with migrations.
2. A scheduler in apps/backend/src/jobs: a check WINDOW, not a moment, with jitter. One queue PER DOMAIN, not one global queue, with a cap on concurrent connections to a domain. A slow domain must not stall the others.
3. Source deduplication on (url_normalized, request_context): one page is fetched once no matter how many rules point at it.
4. A CollectorProvider abstraction with one real implementation and one fixture-backed stub for tests. Every outbound request in the whole extension goes through this one entry point, agent calls included — otherwise the policy below is bypassed by the next new call site.
5. The collection policy from specs/market-intelligence/collection-policy.md, in code and not as configuration: robots.txt parsed, cached with a TTL and obeyed; a self-identifying User-Agent; per-domain rate limits; per-owner caps on products from one domain; no captcha solving, no proxy rotation to evade a block, no impersonating a search engine.
6. Manual intake: a person uploads a file or pastes text, it is normalized and stored as a snapshot with method=manual and body_kind=manual_upload. This is a first-class feature — robots.txt forbids exactly the documents we most want (Tilda offers, InSales offer and plans page).
7. Body normalization to visible text plus a content hash. Bodies go to object storage (the S3 provider is already env-driven in apps/backend/medusa-config.ts), the database holds the hash and the reference. Store visible text, not HTML: measured, that is 135x smaller.
8. Per-pass cost accounting written into every snapshot.

A POLICY REFUSAL IS AN EVENT, NOT AN ABSENCE. When robots.txt forbids an address, write a snapshot recording the refusal and quote the forbidding line. "We did not collect" must never be indistinguishable from "we could not".

DO NOT put helper code under src/subscribers: Medusa walks it recursively and validates every .ts there as a subscriber (AGENTS.md).

ACCEPTANCE IS REALITY (rule 18f): run the engine on a live stand for a week against 10-20 sources, then produce artifacts/docs/<date>-mi-core-report.md with numbers read out of the database: snapshots taken, policy refusals, total cost, distribution of fetches across the hours of the day, and a demonstration that a request to a robots-forbidden address was never made. Verify the storefront and backend still typecheck and lint per AGENTS.md.

Every external fact carries its primary source and fetch date (rule 17a). Commits are IVAN_OK=1 prefixed with literal pathspecs, Conventional Commits plus (t-<task-id>). Land with git push -u origin feat/mi-core then gh pr create --base dev. Do not merge.
```

---

## B2 `feat/mi-own-watch`

```
superset ws create --local --project upready-store --branch feat/mi-own-watch --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the "our own competitive intelligence" branch in the upready-store repo, on feat/mi-own-watch forked from dev. Depends on feat/mi-core being merged.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 1.1, 3.3, 5, 6.3, 7), specs/market-intelligence/tariff-observation.schema.json, specs/market-intelligence/collection-policy.md, artifacts/docs/2026-09-13-pricing-features-inventory.md, artifacts/docs/2026-09-13-homepage-concept.md.

BUILD the narrow, expensive loop: 20-120 pages we watch for ourselves. Here the agent reads every page every time — at 0.59 rub per pass that is about 2100 rub a month, and quality of parsing beats cost.

1. Sources: the pricing pages and legal documents of the competitors Ivan approved (fork 6 of the report). Anything robots.txt forbids is set up for MANUAL INTAKE only and never fetched automatically. As measured 2026-09-14: Tilda's offer PDFs and InSales /page/offer* and /page/newplans are forbidden; Shopify /pricing is allowed by robots.txt but forbidden by its own ToS section 1.9, so do not add it until fork 1 is settled.
2. Agent extraction of a tariff table into specs/market-intelligence/tariff-observation.schema.json. The "unmapped" array is an assertion, not a default: whatever the agent saw and could not place goes in it.
3. Semantic diff of a legal document: normalize, diff by paragraph, then have the agent judge each changed paragraph for significance and consequence. The output card carries the section, the VERBATIM quote before, the VERBATIM quote after, one sentence on what it changes, and a link to the snapshot. A paraphrase without a quote does not go in the card.
4. A digest of changes: a file under artifacts/ and, once the bot token exists (t-2026-09-13-04), a Telegram message.
5. An export in the shape the comparison table (t-2026-09-13-03) consumes, reconciled against artifacts/docs/2026-09-13-pricing-features-inventory.md.

ACCEPTANCE IS REALITY: a month of running. Produce the full list of cards issued, and for each a human verdict "real change / noise". The bar: no more than one false card per source per month, and at least one confirmed change found before anyone noticed it by hand.

Rule 17a everywhere: every competitor number carries its URL and the date it was fetched. Commits IVAN_OK=1 with literal pathspecs, Conventional Commits plus the task id. Push and gh pr create --base dev. Do not merge.
```

---

## B3 `feat/mi-templates`

```
superset ws create --local --project upready-store --branch feat/mi-templates --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the templates-and-self-healing branch in the upready-store repo, on feat/mi-templates forked from dev. Depends on feat/mi-core being merged.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 2 and 3), specs/market-intelligence/change-detection.md, specs/market-intelligence/extraction-template.schema.json.

THIS BRANCH IS WHERE THE ECONOMICS ARE WON. A selector pass costs about 0.07 rub, an agent pass about 0.59 rub. Your job is to make the selector carry the daily load and the agent appear only when the selector dies.

1. extraction_template per the schema: the ANCHOR (what we are looking for) stored separately from the SELECTOR (how we found it last time). The selector is a cache; the anchor is the identity. Versions are appended, never overwritten — otherwise nobody can answer "since which day were we reading it wrong".
2. Template health: hit / miss / implausible. Plausibility is three independent conditions, not a single percentage: value inside the historical corridor with headroom, step within the daily limit, type and currency unchanged.
3. Quarantine after two consecutive failures with a 15-minute retry between them.
4. A re-finder agent. Its input is the page's visible text, the anchor, the value history and the previous selector. Its output is A NEW SELECTOR, not a value. A value the agent produced but no selector reproduces is a draft and must never drive a price change.
5. Re-finding a page that moved: sitemap.xml, then the site's own search, then links from the home page. Reproduce the measured case: insales.ru/page/newplans still answers HTTP 200 with a June 2023 archive notice and zero price tokens, while the live 2026 tariff page is at /page/obnovlenie-tarifov-insales-v-2026 and is reachable only through sitemap-custom.xml — the InSales home page's static HTML holds 175 hrefs and not one containing price, tarif or plan.
6. The "lost" state is visible to a person. Never serve the last known value as if it were current. Zero is not empty.
7. A daily budget for agent calls and a repair queue ordered by priority. A redesign at one large site can break thousands of templates in one hour; without a budget that hour spends a month of money.
8. Confirmation by a second measurement: changes are born "suspected" and become "confirmed" only when a second independent pass agrees; otherwise "dismissed", keeping both snapshots.

ACCEPTANCE IS REALITY: a month over the B2 sources plus 50 product pages, then a report carrying FOUR MEASURED NUMBERS: cost per pass, template breakage frequency, share of dismissed changes, share of successful re-finds. Those numbers replace three estimates in section 8 of the research report — say explicitly in the report which estimate each one replaces and by how much it differs.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B4 `feat/mi-tenant-sources`

```
superset ws create --local --project upready-store --branch feat/mi-tenant-sources --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the store-owner watching branch in the upready-store repo, on feat/mi-tenant-sources forked from dev. Depends on feat/mi-core and feat/mi-templates being merged.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 1.2, 5.1, 9, 10), specs/market-intelligence/watch-rule.schema.json, specs/market-intelligence/change-detection.md. For UI work read ~/upready/packages/geist-kit/AGENTS.md first — the design system is Geist (rule 27), and a UI task starts with a design stage and a named mockup (rule 27d).

THIS IS THE BRANCH WHERE THE PRODUCT BECOMES A PROMISE TO A CUSTOMER. Everything before it was reversible for free.

1. Tenant-owned sources with strict isolation: one owner's rules and prices are invisible to another. Never compute a "market recommendation" from the prices of our own tenants — that is the antitrust construction described in section 6.1 of the report.
2. An "add a competitor" screen: the owner pastes a link, the agent proposes the anchor and the value it will track, and then A CONFIRMATION SCREEN shows what will be watched and how often. The agent never activates a watch on its own. Without that screen the agent becomes a generator of silently wrong watches.
3. Category watching: an address plus a selection rule, for example the ten cheapest products in the category.
4. Owner rules per specs/market-intelligence/watch-rule.schema.json: direction, threshold, channel, frequency. Action is limited to "notify" in this branch — no pricing actions.
5. Price history with a chart; every point links to the snapshot it came from.
6. Digest by default. Instant notification only when the rule says so. Hysteresis and deduplication: no notifying about a return into the corridor, about the same value twice, or about wobble inside the threshold.
7. Source state visible to the owner — active, quarantined, lost, restricted, policy_blocked — always next to the date of the last successful measurement. An owner must never make a decision on a dead number believing it is live.
8. The owner confirms, when adding a source, that they are entitled to watch it. Use the wording Ivan approves (fork 7 of the report); do not invent legal wording yourself.

ACCEPTANCE IS REALITY: five live stores, one month. Measure and report: how many watches were created on the first try with no correction, how many notifications were sent, how many the owners called useful. At least one owner sets up a watch without our help, in a browser, and we watch them do it.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B5 `feat/mi-product-matching`

```
superset ws create --local --project upready-store --branch feat/mi-product-matching --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the product-matching branch in the upready-store repo, on feat/mi-product-matching forked from dev. Depends on feat/mi-tenant-sources being merged.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 2.2, 5, 11.1), specs/market-intelligence/extraction-template.schema.json, specs/catalog-taxonomy/GLOSSARY.md.

MATCHING IS THE PART COMPETITORS CHARGE EXTRA FOR. Price2Spy sells automatic matching as a paid module. Our advantage is position, not technology: the store's catalogue is already in our database, so matching starts one step later than it does for them.

1. A matching ladder, tried in order: GTIN/EAN, then seller SKU, then brand plus model, then an agent with embeddings over title and attributes. Record WHICH RUNG produced each match — the accuracy of the ladder is the deliverable.
2. A confidence score, and a human confirmation queue for everything below the threshold.
3. One-click unlinking of a wrong pair, remembering the rejection so the same pair is not proposed again.
4. A "confirmed by a human" flag on the match. Automatic repricing (B7) will require it.

ACCEPTANCE IS REALITY: take the catalogue of a live store, 100 products, check every proposed pair by hand, and publish the table "rung -> proposed -> correct -> wrong". A share is not a measurement unless the denominator is stated. Do not report an aggregate without saying how many pairs each rung produced.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B6 `feat/mi-reprice-advice`

```
superset ws create --local --project upready-store --branch feat/mi-reprice-advice --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the price-advice branch in the upready-store repo, on feat/mi-reprice-advice forked from dev. Depends on feat/mi-product-matching being merged AND on the cost calculator of task t-2026-09-14-02 being available.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (section 11), specs/market-intelligence/watch-rule.schema.json.

THIS BRANCH PROPOSES PRICES. IT DOES NOT CHANGE THEM. Automatic repricing is branch B7 and is gated on Ivan's decision.

1. Two floors: the one the owner set by hand, and the margin floor from the cost calculator (t-2026-09-14-02). THE LARGER OF THE TWO APPLIES. The manual floor is set ONLY by the store owner — not by a supplier, not by us, not by an agent. The reason is legal: article 11 part 2 clause 1 of the Russian competition law treats a resale price imposed by a supplier as a vertical agreement.
2. A pricing rule: undercut the lowest competitor price by an absolute or relative amount, but never below the floor.
3. A proposals screen: was, becomes, which competitor, which snapshot, which floor, and a button.
4. A reprice_action journal recording accepted AND rejected proposals.

TRY TO BREAK IT, do not just test it (rule 18f): write a rule that WOULD go below the floor and show that it does not. That negative test is the acceptance, not a green suite.

ACCEPTANCE IS REALITY: five stores, one month. Report the share of proposals accepted, and zero proposals below the larger floor — verified over the WHOLE journal, not a sample.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B7 `feat/mi-reprice-auto`

```
superset ws create --local --project upready-store --branch feat/mi-reprice-auto --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the automatic repricing branch in the upready-store repo, on feat/mi-reprice-auto forked from dev. Depends on feat/mi-reprice-advice being merged, on Ivan settling fork 3 of the research report, and on the legal review of points 2 and 3 of section 6.1.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 6.1, 11 in full), specs/market-intelligence/watch-rule.schema.json.

THIS IS THE MOST DANGEROUS FEATURE IN THE EXTENSION. It moves other people's money, and the European Commission has already written, in its 24 July 2018 decision fining four electronics makers 111 million euro, that repricing algorithms following competitors spread a price restriction across a whole market. We are about to hand such an algorithm to a thousand sellers.

Everything below is CODE, not a prompt and not a setting (rule 41):

1. The automatic mode is switched on by a separate deliberate action and only when both floors are set.
2. A cap on the daily step and on the number of repricings per product per day.
3. A quiet period after a repricing, during which the product does not react to the competitor. This treats both lag and loops.
4. Only a CONFIRMED change moves a price. A suspicion never does. Only method=selector values, never an agent's value.
5. Only a human-confirmed match (B5) moves a price.
6. A mirror-pair detector: if a competitor's price systematically follows ours with a lag, halt the automation for that pair and explain it to the owner.
7. One-click revert: the price goes back and the rule is paused. Without a working revert this feature must not ship — reversibility is what the whole product promises on its home page.
8. Tenant isolation: never reveal one owner's price to another, and never derive a "market recommendation" from our own tenants' prices.

ACCEPTANCE IS REALITY, AND THE NEGATIVE TEST COMES FIRST: build a stand with two stores following each other, show the loop detector firing and the automation halting. Only then a month on three live stores whose owners agreed. Report: zero repricings below the floor and zero above the daily cap, verified over the WHOLE journal; the revert demonstrated in a browser.

If any guard cannot be satisfied, stop and ask rather than shipping the feature with the guard disabled.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B8 `feat/mi-chat-intake`

```
superset ws create --local --project upready-store --branch feat/mi-chat-intake --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the chat-intake branch in the upready-store repo, on feat/mi-chat-intake forked from dev. Depends on feat/mi-tenant-sources being merged.

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (section 5.1), specs/market-intelligence/watch-rule.schema.json. For UI read ~/upready/packages/geist-kit/AGENTS.md first (rule 27).

THE POINT OF THIS BRANCH, IN ONE LINE: the chat is how a watch is SET UP, not how it is RUN. The agent turns a sentence into a template and a rule; after that the cheap deterministic collector does the work.

1. A sentence from the owner ("watch the price of this item at site.ru and tell me if it drops below 3000") becomes a draft: source, anchor, rule.
2. The draft goes through THE SAME confirmation screen as B4. The agent does not activate a watch itself, ever.
3. If there is no link, find the competitor's product page by name — respecting the collection policy.
4. When the anchor is ambiguous, ASK. Do not guess. A guessed anchor produces a watch that is silently wrong for months.

ACCEPTANCE IS REALITY: 30 sentences taken from real owners or from their actual wording, and a table "sentence -> what the agent proposed -> accepted as is / corrected / rejected". Report the raw counts, not only the share.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```

---

## B9 `feat/mi-quotas`

```
superset ws create --local --project upready-store --branch feat/mi-quotas --base-branch dev --agent claude --prompt "<промпт ниже>"
```

```
You are the executor of the quotas-and-billing branch in the upready-store repo, on feat/mi-quotas forked from dev. Depends on feat/mi-tenant-sources being merged and on Ivan settling fork 4 (the quota numbers).

READ FIRST: artifacts/research/2026-09-14-market-intelligence/report.md (sections 8 and 9), artifacts/docs/2026-09-13-pricing-features-inventory.md.

WHY THIS BRANCH EXISTS, IN NUMBERS: watching 50 products for each of 1000 stores once a day costs us about 135 000 rub a month, which is 135 rub per store, against the 699 rub middle plan ("Pro" since 2026-09-14; plan names are Besplatnyy / Pro / Ultra, prices unchanged). Watching is a metered resource, exactly like "up to 15 products". Frequency is the price: once a day, once every six hours and once an hour differ by a factor of 24. For reference, Priceva's default schedule is once a day on every plan including the 96 000 rub one, and Prisync's three-times-a-day is its top URL-model tier.

1. A watch quota and an allowed frequency per plan (numbers from Ivan, fork 4).
2. Actual cost accounting per tenant from snapshot.cost.
3. Over-quota sold per check, the way Priceva does (0.25 to 0.12 rub per check, measured 2026-09-14).
4. A spend screen for the owner: how many watches, at what frequency, at what cost.
5. Abuse limits: a cap on new sources per day, and a cap on products from one domain per owner. That second cap is also the legal limit from section 6.4 of the report — article 1334 of the Russian Civil Code presumes a database of 10 000 or more elements to be protected, and "a substantial part" of it may not be extracted.

ACCEPTANCE IS REALITY: one month, then reconcile the calculated cost against the actual cost over ten stores and publish both columns with the difference. Separately, demonstrate that an attempt to exceed the quota is refused.

Commits IVAN_OK=1 with literal pathspecs. Push and gh pr create --base dev. Do not merge.
```
