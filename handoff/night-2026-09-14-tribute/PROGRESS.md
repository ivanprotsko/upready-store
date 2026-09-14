# PROGRESS — night 2026-09-14 (append-only; the orchestrator's memory across relaunches)

## 2026-09-14 10:15 WITA — planning session (Fable, ~2 % limit left)
- Inventory done: 60+ branches, 6 open PRs (#5 miniapp, #6 pricing-copy, #7 price-cost-calc, #8 market-intel, #11 bot, #12 onboarding). :5335 = apps/homepage/port from the pricing-copy worktree.
- Runner + cron + caffeinate installed (see run.sh). Orchestrator starts at the cron time in run.sh's header comment.

NEXT: Phase 0 (bootstrap) — read MISSION.md, verify stands, plan.

## Planning-session triage (2026-09-14 10:15 WITA) — start here
| Branch / PR | Done | Missing for the goal | Decision |
|---|---|---|---|
| PR #6 feature/pricing-copy (:5335) | tariff names Free/Про/Ультра, values without row labels, 7-day trial, tested on :5335 | CONFLICTING with dev; merge | MERGE FIRST (required) |
| PR #12 feature/onboarding | buttons: free → `/start/onboarding`, paid → `t.me/upreadystore_bot?start=plan_N`; wizard tested on :8041 (store in 12 s, 10 products) | rebase on #6, prod `VITE_FUNNEL_BASE_URL=https://shiftship.dev` (or the chosen public host), live test | MERGE (required) |
| PR #11 feature/upreadystore_bot | apps/bot answers `/start plan_N` with pay buttons; mergeable | deploy the bot process live (Coolify host), pay buttons need Tribute → until approval point them to a placeholder/contact | MERGE + DEPLOY (required for paid buttons to answer) |
| PR #7 feature/price-cost-calculator | model + calculator, N=0.10 ₽/product/month | none for the goal | merge if green (optional) |
| PR #8 feature/market-intelligence | docs only | — | leave open (skip) |
| PR #5 feature/telegram-miniapp | backend+storefront mini app, 12 unit tests | live provisioning, bot token | SKIP (Ivan named it) |
| MT tip feat/abstract-datasets (contains mt-deploy, mt-panel-2 wave 2 e2e 215/215, tenant-identity, head-footer fix) | funnel, tenant store creation, subdomain+wildcard TLS, tenant panel (products, categories, home/hero, pages, orders, promotions, profile) — accepted on live 2026-09-12 | verify the LIVE host runs this tip; redeploy if behind; live acceptance of every checklist row; then PR into dev | DEPLOY + ACCEPT (core of the goal) |
| feat/catalog-taxonomy | canonical tenant-address policy (docs + 1 commit) | confirm canonical domain behaviour live; merge the 1 commit into the MT tip | MERGE into MT tip + verify |
| feat/mt-storefront-wave2 | locale/currency, 11 unique commits | green check, merge into MT tip | merge if green (optional) |
| feat/cherkashina-tenant | real client tenant, per-tenant secrets question open | — | skip tonight |
| feat/stands/*, feat/store/*, feat/ds-foundation, feat/seam-tests, feat/mode-image-pairs, feat/locale-detect, feat/store-profiles, feat/store-theme-surface, feat/stands-composition | demo stands / design system / tests | not on the goal path | skip |
| feature/content-pages, feature/editing-mode/commenting, homepage line worktrees | homepage line; #1–#4 merged | check whether anything unmerged is referenced by the tariff page | triage in Phase 1 |

NEXT: Phase 0 — bootstrap, then Phase 2 (landing PRs #6→#12→#11) and Phase 3 (MT live acceptance) IN PARALLEL with workers.
