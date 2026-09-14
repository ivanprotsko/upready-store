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

## 2026-09-14 10:23 WITA — Phase 0+2 (orchestrator, Opus 5)
- Стенды замерены: :5335 = 200, https://upready.dev = 200 (СТАРЫЙ лендинг «Свой магазин для продавца Wildberries» из репозитория ~/upready/projects/upready-dev, не наш vite-порт), https://shiftship.dev/start/onboarding = 200, backend :9031 = 200. МЁРТВЫ: :8041 (storefront), :8010 (панель).
- Фан-аут разрешён приказом Ивана в MISSION.md; маркер orch снят. Запущены два фоновых разведчика: mt-audit (opus, живая MT-платформа на 84.46.251.149, READ-ONLY) и bot-audit (sonnet, apps/bot / PR #11).
- **DONE: PR #6 (feature/pricing-copy) смержен в dev.** Конфликт был только в HANDOFF.json (журнал) — взята версия dev; merge-коммит 2b4d883; merged_at 2026-09-14T02:22:24Z (GitHub, UTC).
- feature/onboarding слита с новым dev (merge-коммит 20f38ba, конфликт только HANDOFF.json). tsc rc=0; vite build rc=0 (71 модуль, 252.93 kB js). В сборке подтверждены адреса: /start/onboarding, https://shiftship.dev, https://t.me/${bot}?start=plan_N.
- Токен бота существует: .env.example PR #12 называет TELEGRAM_UPREADY_STORE_BOT в .env репозитория; getMe по username upreadystore_bot проверен автором PR 2026-09-14.

NEXT: домержить PR #12 (GitHub ещё пересчитывал mergeable), затем PR #7 и #11; собрать лендинг и опубликовать на upready.dev (CF Pages проект upready-landing); параллельно — приёмка MT по отчётам разведчиков.

## 2026-09-14 10:34 WITA — Phase 2 ЗАКРЫТА: лендинг живёт на upready.dev
- **DONE: PR #12 (feature/onboarding) смержен в dev.** Конфликт был содержательный: в dev от PR #6 — переключатель периода оплаты и новая структура карточки, в #12 — маршруты кнопок. Слито ОБА: структура карточки из #6, маршрут кнопки из #12 (merge-коммит f0ec52b). merged_at 2026-09-14T02:27:06Z.
- **DONE: PR #11 (feature/upreadystore_bot) смержен в dev** (конфликт только HANDOFF.json). merged_at 2026-09-14T02:27:34Z.
- **DONE: PR #13 — продакшен-head лендинга** (title/description/canonical/og/twitter, og-обложка 1200×630 с живой страницы, favicon.svg) + починена устаревшая проверка CTA в scripts/accept-homepage.mjs. merged_at 2026-09-14T02:33:38Z.
- **DONE: ДЕПЛОЙ.** `apps/homepage/port/dist` опубликован в Cloudflare Pages, проект upready-landing, ветка main (прод): деплой 219cc618. Превью для проверки было 7bccc644 / night-tribute.upready-landing.pages.dev. Сборка: VITE_FUNNEL_BASE_URL=https://shiftship.dev, VITE_TELEGRAM_BOT=upreadystore_bot.
- **Живая приёмка https://upready.dev/ — PASS 34 из 34** (node scripts/accept-homepage.mjs --url https://upready.dev/), консоль чиста на 1440×900 и 390×844. upready.dev и www.upready.dev = 200, /og-cover.png = 200, /favicon.svg = 200.
  - Адреса кнопок на ЖИВОЙ странице: hero/nav/plan-free/final → https://shiftship.dev/start/onboarding; plan-pro → https://t.me/upreadystore_bot?start=plan_2; plan-ultra → …plan_3.
  - Кадры и лог: handoff/night-2026-09-14-tribute/artifacts/{live-upready-dev-1440.png,live-upready-dev-390.png,accept-upready-dev.log}.
- Защищённая инфраструктура цела: https://hooks.svgnoon.upready.dev/health = 200 после всех операций.
- Откат, если понадобится: предыдущий прод-деплой CF Pages — 7494722c (старый лендинг из репозитория ~/upready/projects/upready-dev, коммит 445b8b6).
- Разведка бота (bot-audit, замеры): токен TELEGRAM_UPREADY_STORE_BOT лежит в apps/bot/.env, getMe подтвердил username upreadystore_bot; тесты 15/15, tsc rc=0; бот СЕЙЧАС работает как голый foreground-процесс pid 93693 на Маке Ивана (без супервизора, умрёт со сном ноутбука); на Coolify-хосте его нет; 6 переменных TRIBUTE_URL_PLAN_* не заданы — бот честно пишет «оплата подключается» вместо мёртвых кнопок. Отчёт: handoff/night-2026-09-14-tribute/recon-bot.md.

NEXT: Phase 3 — MT-платформа. Дождаться mt-audit, поднять/проверить воронку → создание магазина → субдомен по HTTPS → канонический домен → панель тенанта; затем надёжный деплой бота на always-on хост.
