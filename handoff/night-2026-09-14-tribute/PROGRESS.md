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


## bot-deploy (2026-09-14 10:51 WITA)

Бот @upreadystore_bot снят с ноутбука и живёт на always-on хосте как СВОЙ изолированный docker-стек. Ниже только замеры.

**Упаковка (PR #14, слит в dev, merge-коммит da1194b3, mergedAt 2026-09-14T02:50:32Z).** Ветка `feature/bot-docker-deploy` от `origin/dev`. Добавлено: `apps/bot/Dockerfile` (node:22-alpine), `apps/bot/docker-compose.yml`, `apps/bot/.dockerignore`, `apps/bot/DEPLOY.md`, правка `apps/bot/.env.example`.

**Шага сборки нет — это проверено, а не предположено.** В ТОМ ЖЕ образе: `docker run --rm --entrypoint node upreadystore-bot:local --version` → `v22.23.2` (engines требует `>=22.18.0`), `--test src/message.test.ts src/route.test.ts` → `# tests 15 / # pass 15 / # fail 0`. Локально до деплоя `node --test src/*.test.ts` → `ℹ pass 15 / ℹ fail 0`.

**Перенос.** `rsync -av --delete --exclude=.env` в `/opt/upready-store-bot/` (явный каталог-приёмник). Приёмка по ЦЕЛЕВОМУ пути (правило 42c): md5 совпали по 11 файлам, финально `Dockerfile f4bb621b…`, `docker-compose.yml 3ec6fb25…`, `DEPLOY.md 015a2361…`, `.env.example 2eb45289…`, `package.json 89e64dc1…`, `src/index.ts e296200d…`. Токен доставлен отдельным `scp` в `/opt/upready-store-bot/.env` (mode 600, md5 совпал с локальным), значение нигде не печаталось.

**Один потребитель getUpdates.** Локальный поллер убит ПЕРЕД стартом удалённого: `kill 93693` rc=0, затем `ps -p 93693` → rc=1 (строки нет), других процессов `apps/bot` на Маке нет. Только после этого `docker compose -f /opt/upready-store-bot/docker-compose.yml up -d --build`.

**Стек.** `docker ps` → `upreadystore-bot | Up | upreadystore-bot:local`. `docker inspect` → `restart=unless-stopped`, `project=upready-store-bot`, `ports=map[]` (ни одного опубликованного порта, ни меток traefik, ни DNS — бот на длинном опросе). Лог старта: `bot.start id=8710049173 username=upreadystore_bot`, следом шесть `payment.link.missing` (Tribute намеренно не подключён).

**Контейнер действительно ОПРАШИВАЕТ, а не просто запущен.** Конкурирующий `getUpdates` с моей стороны получил `{"ok":false,"error_code":409,"description":"Conflict: terminated by other getUpdates request…"}`, и в логе контейнера в ту же секунду встал зеркальный `{"event":"getUpdates.failed","error":"getUpdates: 409 Conflict…"}` — обе стороны увидели конфликт, значит слот опроса держит контейнер.

**СКВОЗНАЯ ПРОВЕРКА ДИПЛИНКА — СДЕЛАНА, живым клиентом Telegram.** Через `open "tg://resolve?domain=upreadystore_bot&start=plan_2"` (аккаунт Ивана, chat_id 51632224). В логе УДАЛЁННОГО контейнера:
`{"event":"sendMessage.request","payload":"plan_2","source":"command","update_id":861312826,"chat_id":51632224}` → `{"event":"sendMessage.ok","message_id":7}`, текст ответа начинается «Здравствуйте! Это бот upready.dev …», далее `<b>Профи</b> — 458 ₽ в месяц при оплате за год`, `reply_markup: null` и честная строка «Оплату сейчас подключаем: платёжные ссылки появятся здесь в ближайшее время.» То же для `plan_3` (`update_id=861312825`, тариф «Мастер»). Имена тарифов бота (Новичок/Профи/Мастер) совпали с `apps/homepage/port/src/sections/tariffs/data.ts` на dev — расхождения нет.

**Защищённый контур соседей цел после ВСЕХ операций.** `curl -s -o /dev/null -w '%{http_code}' https://hooks.svgnoon.upready.dev/health` → `200`; `agentcreatr-bridge Up 8 hours`, `coolify-proxy Up 2 days (healthy)`. Ни одного `down`/`stop`/`rm`/`prune`/`volume`, ни одной правки под `/opt/agent-creatr`, ни одной записи DNS.

**Дырки, оставленные открытыми.**
1. Шесть `TRIBUTE_URL_PLAN_{1,2,3}_{RU_MIR,VISA_MC}` не заданы (замысел на сегодня): кнопок оплаты нет, вместо них честная строка. Когда Tribute отдаст адреса — дописать в `/opt/upready-store-bot/.env` и `up -d`; `payment.link.missing` в логе сменится на `payment.link.ready`.
2. Токен по-прежнему НЕ зарегистрирован в `~/upready/.env.keys` — он живёт в gitignored `apps/bot/.env` воркдерева `feature/upreadystore_bot` и на хосте в `/opt/upready-store-bot/.env`. Если воркдерево вычистят, ссылка на источник теряется.
3. Юзербот-сессии Telethon (`tg-reply-copilot/.tg_session*`) МЕРТВЫ: `get_me()` → `None` на обеих. Сквозная проверка прошла не через них, а через десктопный клиент; автоматического регрессионного e2e для бота нет.
4. Стек поднят руками через compose, а не как ресурс Coolify: в UI Coolify его не видно, автодеплой по push не настроен. Обновление — `rsync` + `up -d --build` по `apps/bot/DEPLOY.md`.

NEXT (bot-deploy): дырок, блокирующих tribute.top, нет. Остаётся отдать Ивану шесть адресов Tribute и дописать их в `/opt/upready-store-bot/.env`.

## 2026-09-14 10:54 WITA — Phase 3: замеры живой платформы и деплой ветки feat/night-funnel-brand
### Что измерено на ЖИВОМ стенде (до изменений)
- Хост 84.46.251.149: контейнеры mt-storefront, mt-backend, mt-panel, mt-postgres, mt-ingress-sync — Up 2 days (healthy). Код в /opt/upready-store/mt — НЕ git-чекаут, а rsync-копия от 11.09 23:01, то есть ЖИВОЕ старше типа MT (e370939 от 12.09).
- Воронка https://shiftship.dev/start/onboarding: заголовок был «Оплата → онбординг · тестовый стенд», в шапке «Shiftship · demo · настоящих платежей нет». Для заявки в tribute.top это блокер: туда ведёт главная кнопка upready.dev.
- **Мастер создаёт НАСТОЯЩИЙ магазин** (route.ts: register → POST /tenants → seed → PUT /tenants/home). Пройден живьём: handle night-tribute-1045, магазин создан за **4.8 с**, витрина https://night-tribute-1045.shipshift.dev/ отвечает 200 с ВАЛИДНЫМ wildcard-сертификатом *.shipshift.dev (Let's Encrypt, до 2026-12-10), ssl_verify_result=0, заголовок = имя магазина. Кадры: artifacts/onb-1..4, tenant-storefront.png.
- ДЕФЕКТЫ живого стенда: каталог после создания ПУСТОЙ («Каталог пустой — это новый магазин» — текст старше типа, в типе есть сид), витрина открывается на EN/USD, подвал англоязычный.
- Панель https://panel.shipshift.dev: 200, SPA редиректит на /login и рисует форму входа, но с надписью «Welcome to Medusa» и по-английски. 401 на /tenants/me до входа — ожидаемо.
- Зоны shiftship.dev, shipshift.dev, upready.dev — все НАШИ (Cloudflare). Канон specs/tenant-address/CANONICAL.md называет целевой зоной платформы upready.dev; перенос зоны магазинов объявлен там отдельной задачей — сегодня НЕ делается.

### Что сделано
- Ветка **feat/night-funnel-brand** от типа MT e370939. Коммиты: 061c173 (ребрендинг воронки и панели), f952143 (merge feat/mt-storefront-wave2 — русский по умолчанию, валюта по локали, 301 со старых адресов, подвал-атрибуция), ed24fa7 (адреса зоны upready.dev в traefik/compose).
- Проверки ветки: storefront tsc rc=0, storefront vitest **117/117**, tenant-panel build (tsc+vite) rc=0.
- DNS в зоне upready.dev: созданы A start.upready.dev и A panel-store.upready.dev → 84.46.251.149, proxied=false. Защищённая запись hooks.svgnoon.upready.dev НЕ тронута.
- **Бэкап живой БД снят ДО изменений**: /opt/upready-store/backups/mt-medusa_mt-20260914-044751.sql.gz (4 449 960 B, 179 678 строк, gzip -t пройден).
- env стенда обновлён на хосте (md5 сверен по целевому пути, b788f188…): DEMO_HOSTS += start.upready.dev, DEMO_PANEL_URL=https://panel-store.upready.dev, STOREFRONT_DEFAULT_LOCALE=ru, DEFAULT_REGION=ru (регион Russia/rub в базе ЕСТЬ — замер), STORE_NAME=Upready, PANEL_DOMAIN_ALT, CORS дополнены. Прежний env сохранён: /tmp/mt-env-backup/shipshift.env.
- Код синхронизирован на хост (rsync -az --delete, env исключён; удалено 26 файлов — только убранные волной 2 и артефакты).
- Запущена пересборка образов backend+storefront+panel: лог /opt/upready-store/mt-build-20260914.log.

NEXT: дождаться сборки → docker compose up -d → скопировать traefik-demo-hosts.yml в /data/coolify/proxy/dynamic → проверить start.upready.dev и panel-store.upready.dev по HTTPS → создать новый магазин и убедиться, что каталог засеян и витрина русская → приёмка панели (товары, категории, hero, страницы, заказы, промо) → пересобрать лендинг с VITE_FUNNEL_BASE_URL=https://start.upready.dev и передеплоить CF Pages.

## 2026-09-14 11:04 WITA — Phase 3 DONE (ядро): вся цепочка живёт на upready.dev
- **Деплой MT выполнен.** Образы mt-backend/mt-storefront/mt-panel пересобраны из feat/night-funnel-brand, `docker compose -p mt … up -d --no-build --no-deps backend storefront panel` rc=0, все три контейнера healthy. Защищённые agentcreatr-bridge и coolify-proxy не тронуты; https://hooks.svgnoon.upready.dev/health = 200 после всех операций.
- **Живые адреса (замер):**
  - https://start.upready.dev/start/onboarding → 200, заголовок «Создать магазин · Upready», сертификат CN=start.upready.dev (Let's Encrypt, до 2026-12-13), ssl_verify_result=0.
  - https://shiftship.dev/start/onboarding → 200, тот же заголовок (старый адрес оставлен рабочим).
  - https://panel-store.upready.dev → 200, заголовок «Панель магазина · Upready», сертификат выпущен. panel.shipshift.dev тоже жив.
- **Магазин, созданный через НОВЫЙ адрес:** handle zolotaya-nit-1057, «Золотая нить», создан за **6.9 с**. Витрина https://zolotaya-nit-1057.shipshift.dev → редирект на **/ru**, цены в **₽**, canonical = собственный адрес магазина (а не stores.\*, дефект из CANONICAL.md §1.1 не воспроизводится). Каталог **засеян: 10 товаров в пяти категориях**. Ссылка на панель в мастере теперь panel-store.upready.dev.
- **Найден и починен дефект: все картинки витрины отдавали 404.** Причина (замер, не гипотеза): витрина просит https://shipshift.dev/static/store-profiles/abstract/*.webp; бэкенд монтирует /opt/upready-store/media → /app/static/store-profiles, а на хосте лежали только пять СТАРЫХ профилей (electronics, home-goods, sneakers, supplements, womens-fashion) — каталога `abstract` не было вовсе. 16 .webp профиля abstract нашлись в worktree feat/abstract-datasets (они gitignored — «media never enter git»), скопированы в ветку деплоя и синхронизированы на хост; приёмка по ЦЕЛЕВОМУ пути: 16 файлов, md5 сошлись, https://shipshift.dev/static/store-profiles/abstract/home-hero.webp = 200 image/webp. Повторный обход витрины: **неудачных запросов 0** (было 11). Кадр artifacts/tenant-storefront-images-ok.png — hero, пять категорий с картинками, товары с картинками и ценами в рублях.
- **Лендинг пересобран и передеплоен** на VITE_FUNNEL_BASE_URL=https://start.upready.dev (CF Pages деплой fbdb8855). Живая приёмка https://upready.dev/ — снова **34 из 34**; адреса кнопок: hero/nav/plan-free/final → https://start.upready.dev/start/onboarding, plan-pro/ultra → t.me/upreadystore_bot?start=plan_2|3.
- **Бот жив** (воркер bot-deploy): контейнер upreadystore-bot на том же хосте, restart=unless-stopped, ответ на `/start plan_2` подтверждён реальным клиентом Telegram (message_id 7), PR #14 смержен в dev.

### Открытые дефекты и дырки (не блокеры показа, но записаны честно)
1. Медиа профиля `abstract` существуют ТОЛЬКО в worktree feat/abstract-datasets и на хосте — в git их нет по решению «media never enter git». Любой новый чекаут снова даст витрину без картинок. Нужен либо реестр медиа, либо S3/R2.
2. Названия товаров, категорий и заголовки секций стартового каталога — английские («Spheres», «Cube No. 1 · Chalk white», «New arrivals»), хотя витрина русская. У профиля abstract есть каталог i18n — перевод не применяется.
3. Магазин night-tribute-1045 создан ДО деплоя и остался с пустым каталогом — это тестовый магазин, трогать не нужно.

NEXT: приёмка панели тенанта на живом стенде — товары (создание; картинки, обложка, цена, варианты, опции, описание, характеристики), категории (картинки + содержание), hero/главная, страницы, заказы, промо; каждое изменение проверяется НА ВИТРИНЕ. Дальше — REPORT.md.

## 2026-09-14 11:15 WITA — интеграция и защита инфраструктуры (оркестратор)
- **PR #16 открыт: feat/mt-into-dev → dev** — линия MT приходит в базу. Отдельная интеграционная ветка сделана НАМЕРЕННО: feat/night-funnel-brand обязана оставаться зеркалом того, что стоит на живом стенде, пока идёт приёмка. PR #15 (из самой ветки деплоя) закрыт как замена.
  - Конфликтов оказалось ровно **три**, разрешены содержательно: `.gitignore` — объединены обе стороны (списки перечисляют РАЗНЫЕ артефакты, потеря любого однажды внесёт бинарники в историю, 21f); `specs/tenant-address/CANONICAL.md` — взята таблица состояний из ветки, она подробнее; `HANDOFF.json` — журнал, версия dev.
  - Объединённое дерево проверено: pnpm install rc=0, storefront tsc rc=0, tenant-panel tsc rc=0, homepage typecheck rc=0 (apps/homepage исключён из workspace НАМЕРЕННО и ставится своим npm install — это не дефект слияния).
  - **Не мержу до конца приёмки**: находки воркеров приземляются на feat/night-funnel-brand, и их нужно забрать этим же PR.
- **Реестр защищённой инфраструктуры пополнен** (правило 42e): запись `upready-store-mt-platform` в ~/upready/specs/protected-infra/registry.json, коммит f291fb7bc в репозитории ~/upready. Под защитой: контейнеры mt-backend/mt-storefront/mt-panel/mt-postgres/mt-ingress-sync и upreadystore-bot, том mt_db-data (все магазины тенантов), каталог /opt/upready-store/media и файл deploy/mt/shipshift.env (их НЕТ в git), wildcard-сертификат *.shipshift.dev, зоны shipshift.dev/shiftship.dev/upready.dev. В записи — команды проверки и требование pg_dump перед операциями со схемой.
- GitHub Actions в этом репозитории реагируют только на `main` — пуш в dev ничего не деплоит (замер .github/workflows).

### Запущена живая приёмка (шесть фоновых воркеров, каждый на СВОЁМ магазине, чтобы не мешать друг другу)
accept-products (товары: создание, картинки, обложка, цена, варианты, опции, описание, характеристики) · accept-content (категории, главная, hero, изоляция тенантов) · accept-commerce (страницы, промо, касса → заказы; отдельно — какие платёжные провайдеры настроены) · accept-domains (субдомен, смена адреса и 301, свой домен, canonical — по пунктам CANONICAL.md) · legal-pages (публикация оферты/политики/соглашения на upready.dev) · fix-seed-i18n (стартовый каталог по-русски).

NEXT: собрать возвраты воркеров, приземлить их починки на feat/night-funnel-brand, пересобрать и передеплоить MT-стек, домержить PR #16, написать REPORT.md, поставить HANDOFF-статус и создать DONE.

## 2026-09-14 11:39 WITA — Phase 4: живая приёмка панели (оркестратор соло; воркеры прошлой сессии умерли вместе с ней)
Прошлая сессия (attempt 1, 10:18–11:17) упёрлась в НЕДЕЛЬНЫЙ лимит («You've hit your weekly limit · resets Sep 16 at 1am») — шесть фоновых воркеров умерли вместе с ней, оставив кадры в artifacts/ и скрипты в scripts/, но НИ ОДНОГО вердикта в PROGRESS.md. Поэтому приёмка идёт соло и скриптами (правило 19a), фан-аут не запускаю: лимит — связывающее ограничение, а не токен-экономия.
Все замеры ниже сделаны на ЖИВОМ стенде, магазин `accept-commerce-1106` (https://accept-commerce-1106.shipshift.dev), панель https://panel-store.upready.dev.

### Товары — что РАБОТАЕТ (проверено на витрине, а не только в панели)
- Список товаров: 10 позиций, консоль чиста, 0 неудачных запросов.
- **Заголовок, подзаголовок, описание**: правка через /products/<id>/edit сохранена; витрина СРАЗУ показывает «Куб №1 · Меловой белый», подзаголовок и метку NIGHT-PROD-EDIT-1 (без ручной ревалидации).
- **Характеристики** (высота/ширина/длина/вес): 512/12/12/12 сохранены и показаны.
- **Цена в рублях**: у варианта «Малый» было 3 810,00 ₽ → выставил 7 777,00 ₽ → витрина: Малый 7 777,00 ₽, Средний 4 760,00 ₽, Большой 6 060,00 ₽. Замер per-variant, а не «от».
- **Варианты и опции**: три варианта (Small/Medium/Large) с SKU, опция Size — читаются в панели и переключаются на витрине.
- **Медиа**: модалка редактора медиа открывается, загрузка файла проходит, файл ЛОЖИТСЯ на диск и ОТДАЁТСЯ публично (https://shipshift.dev/static/tenants/<id>/<file> → 200 image/webp).

### НАЙДЕН И ПОЧИНЕН БЛОКЕР: каждая картинка, загруженная тенантом, была битой
- **Симптом (замер, не гипотеза):** после загрузки картинки товара в консоли `ERR_CONNECTION_REFUSED`, на витрине новой картинки нет.
- **Причина (в коде, не в догадке):** `useS3 = isProd && Boolean(S3_BUCKET)` в apps/backend/medusa-config.ts; на стенде S3_BUCKET нет, поэтому подключается ДЕФОЛТНЫЙ `@medusajs/file-local`, чей `backend_url` по умолчанию — `http://localhost:9000/static`. Именно этот адрес и уезжает в базу: `image.url = http://localhost:9000/static/tenants/ten_…/1789356736016-night-upload-cube.webp`. Сам файл при этом отдаётся публично — сломан ТОЛЬКО записанный адрес.
- **Масштаб класса измерен по всему дампу БД** (не по одной строке): ровно 2 битых адреса — `public.image` (моя загрузка) и `public.product_category` (картинка категории, загруженная ночным воркером content). То есть дефект бил по ЛЮБОЙ загрузке тенанта — и товары, и категории; уцелели только сидовые картинки, у которых адрес проставлен сидом.
- **Вторая дырка того же места:** `/app/static/tenants` НЕ смонтирован (в compose был только `media → /app/static/store-profiles`), то есть все загрузки тенантов жили внутри контейнера и умирали при первой же пересборке. Класс «потеря данных», нашёлся при разборе первого.
- **Починка** (ветка feat/night-funnel-brand, коммит a4c6f31): в medusa-config.ts объявлен ЯВНЫЙ локальный провайдер с `backend_url` из `LOCAL_FILE_BACKEND_URL` (`upload_dir` намеренно НЕ задан — провайдер и src/tenant-files/index.ts обязаны резолвить один и тот же дефолт); в deploy/compose.mt.yml добавлены `LOCAL_FILE_BACKEND_URL=https://\${ENGINE_DOMAIN}/static` и бинд-маунт `/opt/upready-store/media-tenants → /app/static/tenants`. tsc rc=0. Три уже загруженных файла скопированы на хост в /opt/upready-store/media-tenants ДО пересборки.

NEXT: дождаться сборки backend → up -d --no-deps backend → починить 2 битых адреса в БД (после свежего pg_dump) → повторная загрузка картинки и проверка НА ВИТРИНЕ → приёмка категорий/главной/страниц/заказов/промо → PR #16 → REPORT.md → DONE.
