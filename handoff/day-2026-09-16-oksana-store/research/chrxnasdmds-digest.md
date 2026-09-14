# Дайджест проекта chrxnasdmds — магазин Оксаны Черкашиной (для миграции на upready-store)

Составлено 2026-09-15 чтением `/Users/ivanprotsko/upready/projects/chrxnasdmds` (ветка `dev`, HEAD `ac94c1cd` от 2026-09-06 16:25 +08) и файлов памяти `~/upready/memory/chrxnasdmds-*.md`. Только факты с путями; чего нет — «не найдено».

---

## 1. Бизнес

| Параметр | Факт | Источник |
|---|---|---|
| Ниша | Товары для здоровья: АСД (антисептик-стимулятор Дорогова) в формах свечи/мазь/капсулы/таблетки/раствор/капли; мумиё; БАДы (тройчатка, стевия, спектос-сорбент, иван-чай, сеннол, гепары, сульфат магния, мёд маточный/трутневой); фито-средства с каштаном от варикоза (мазь/свечи/таблетки/капсулы); тайская косметика (зубные пасты, шампуни, бальзам); касторка; бытовое (мультиварка-авто, солемер/TDS-метр, ингалятор, карандаш-ингалятор); 2 книги; курс «Очищение печени» | `/Users/ivanprotsko/upready/docs-projects/chrxnasdmds/catalog-pricelist-2026-09-01/pricelist-canon.json`; `/Users/ivanprotsko/upready/projects/chrxnasdmds/artifacts/product-images-20260906/index.json` |
| Название витрины | title по умолчанию «Черкашина Оксана» / «Cherkashina Oksana»; README: «Магазин здоровья Черкашиной Оксаны»; кодовое имя кольца/бренда — OLAVKA (домен olavka.ru, MerchantLogin Robokassa `OLAVKA`) | `apps/storefront/src/lib/i18n/m-routes.ts:15,199`; `README.md`; `.memory-legacy.md` |
| Продавец | ИП Черкашина Оксана Ивановна, ИНН 524900658999, ОГРНИП 309524933000032 (выписка ЕГРИП от 31.08.2026), г. Элиста (Республика Калмыкия), УСН «доходы», банк Ozon Банк. Телефон `+7 (911) 718-01-23` (не подтверждён), адрес возврата «СДЭК, Элиста, Ленина 1», e-mail — заглушка `olavka@example.com`. Улица/индекс юр. адреса, e-mail, EMAIL_ДПО — ПУСТО | `apps/storefront/src/lib/legal/requisites.ts`; `docs/orchestration/2026-09-03-checkout-legal/n6-requisites.md`; `~/upready/memory/chrxnasdmds-yandex-id-and-rkn-2026-09-03.md` |
| Клиент/контакты | Оксана Черкашина, Telegram @cheroxa7 (id 506508296); помощницы Кира Плаксина и Татьяна Тарасова; группа «Магазин Оксаны Черкашиной» | `~/upready/memory/oksana-cherkashina-store-day-2026-09-16.md`; `~/upready/memory/chrxnasdmds-domains-cherkashino-2026-09-04.md` |
| Домены | **olavka.ru** — на Иване (нерезидент), передать нельзя, оплачен до 2027-07-19, DNS ещё на заглушке 31.31.198.57. **cherkashino.ru + черкашино.рф** — куплены 2026-09-03, карточка администратора = смесь данных Ивана и Оксаны, идентификация Госуслуги НЕ пройдена, тикеты reg.ru отклонены (14.09). **paleoluma.com** — кольцо dev на Contabo (живой магазин). `popova.help`/`stage.popova.help`/`dev.c.shipshift.dev` — прежние кольца из domains.yml (popova.help = старый магазин, не этот) | `~/upready/memory/chrxnasdmds-domains-cherkashino-2026-09-04.md`; `deploy/domains.yml`; `deploy/MIGRATION.md` §3 |
| Языки | Роуты витрины `[countryCode]/[locale]` унаследованы en/ru/uk/ja; конфиг локалей: `ru` (default) + `en`; uk/ja без бандлов падают на en. Юр. тексты — только ru. ТЗ 13.05: «Русский только» | `apps/storefront/src/lib/i18n/locales-config.ts:43-46`; `docs/orchestration/2026-09-03-checkout-legal/n11-cdek-verdict.md` §1; `docs/brief/cherkashina-tz-2026-05-13.md` |
| Валюта | Магазин: RUB default + EUR + UAH (seed); регион RU в рублях (`ensure-ru-region.ts`); у каждого варианта по цене rub и usd; прайс Оксаны в USD; курс применения 31.08: 1 $ = 90,34 ₽ | `apps/backend/src/scripts/seed.ts:108-144`; `apps/backend/src/scripts/ensure-ru-region.ts`; HANDOFF задача `t-2026-08-31-catalog-pricelist` |
| Доставка | ApiShip (свой модуль `src/modules/apiship` + `src/modules/shipping`, плагин @gorgo отклонён) → **СДЭК** (проверен живьём 01.09 на песочнице edu.cdek.ru: тарифы 185/325 ₽, ПВЗ, боевой = смена 3 env + договор СДЭК), **Почта России** (тариф без ключей, пунктов выдачи нет до ключей otpravka.pochta.ru), WB-доставка отключена, DHL — плейсхолдер. Карта ПВЗ MapLibre + OpenFreeMap (Яндекс.Карты отклонены по лицензии). Порядок чекаута: адрес → доставка (решение 03.09) | `apps/backend/medusa-config.ts:116-160`; `.memory-legacy.md` (cdek-verified-live-2026-09-01, maps-provider-decision, wb-shipping-disabled-recipe); `~/upready/memory/chrxnasdmds-checkout-legal-decisions.md` |
| Оплата | **Robokassa** через `@gorgo/medusa-payment-robokassa@1.0.0` (RUB, карта + СБП — единственные включённые методы у MerchantLogin OLAVKA). Модерация Robokassa НЕ пройдена. Чеки 54-ФЗ не уходят (`useReceipt` выключен). Stripe удалён (`2a93af02`), способ «другое/менеджер» удалён 03.09. Расчётный счёт на сайте не публикуется. Ранние идеи (карта КЗ, USDT) — в ТЗ 13.05, не реализованы | `apps/backend/medusa-config.ts:293-320`; `apps/backend/package.json:25`; `.memory-legacy.md` (robokassa-*) |
| Целевой рынок | РФ (ТЗ 13.05: продажа по РФ, СДЭК; расширение РФ+СНГ+EU+США обсуждалось). Хостинг переносится в РФ ради 152-ФЗ (Рег.облако) | `docs/brief/cherkashina-tz-2026-05-13.md` §2; `deploy/MIGRATION.md` §6 |
| Референс дизайна | Instagram @avhustiin / сайт asd2-3.com («Августин») — «как у него, но лучше» | `docs/brief/cherkashina-tz-2026-05-13.md` |

---

## 2. Инвентарь каталога

### 2.1 Прайс-лист (источник истины по ассортименту и ценам)
- **Актуальный канон — 32 позиции от 2026-09-01, цены USD:** `/Users/ivanprotsko/upready/docs-projects/chrxnasdmds/catalog-pricelist-2026-09-01/pricelist-canon.json` (+ `pricelist-raw.txt`). Позиции: Мумиё 100 г 30$; Свечи АСД усиленная 10 шт 15$; Стевия 120 табл 15$; Мазь АСД 100 г 15$; Капсулы АСД 120 шт 60$; Таблетки АСД 60 шт 18$; Спектос 200 г 30$; АСД-2 Армавир 100 мл 22$; Тройчатка плюс 120 капс 15$; Шампунь мумиё 15$; Шампунь АСД 15$; Солемер 25$; Паста зубная 30 г 8$ / 50 г 12$ / с углём 30 г 8$ / с гвоздикой 30 г 8$; Мазь от варикоза с каштаном 100 г 20$; Свечи с каштаном 10 шт 15$; Таблетки с каштаном 60 шт 15$; Капсулы с каштаном 20$; Шампунь-концентрат тайский 90 г 15$; Мультиварка-авто 100$; Сульфат магния 75 г 10$; Гепары 20$; Иван-чай гранулы 100 г 12$; Капли в нос АСД+серебро 15$; Касторка Индия 100 мл 10$; Ингалятор портативный 40$; Карандаш-ингалятор 5$; Книга «Раздельное питание» 15$; Книга рецептов для мультиварок 15$; Бальзам для волос с мумиё 100 г 15$.
- Предыдущая версия — 36 позиций = PDF от 04.08 (32) + 4 позиции из Telegram 04.08 (Мёд маточный 125 г 10$, Мёд трутневой 125 г 10$, Сеннол 125 г 8$, Набор для очищения лимфы 70$): `/Users/ivanprotsko/upready/projects/chrxnasdmds/handoff-data/catalog-2026-08-31/02-sources/pricelist.pdf`, `…/02-sources/telegram-additions-verbatim.md`. Эти 4 позиции в каноне 01.09 отсутствуют; в БД лежат черновиками (PL-33, PL-34, PL-35, PL-36).
- **Реестр 36 позиций с сопоставлением к БД, фасовкой, фото, кандидатами WB/Ozon и списком расхождений:** `/Users/ivanprotsko/upready/projects/chrxnasdmds/data/catalog-pricelist/registry.json` (36 rows; поля id, name, usd, packaging, match{productId, variantId, sku, currentPriceRub/Usd}, matchKind, matchConfidence, photos, photoDirs, wbCandidates, ozonCandidates, gap) + схема `registry.schema.json` + плоская таблица `/Users/ivanprotsko/upready/projects/chrxnasdmds/handoff-data/catalog-2026-08-31/01-registry/positions.csv`.

### 2.2 База Medusa (локальная, источник миграции)
- `postgres://ivanprotsko@localhost:5433/medusa_chrxn` (PostgreSQL 16 нативный, роль `ivanprotsko`; у роли `medusa` нет прав на product/image). psql: `/opt/homebrew/opt/postgresql@16/bin/psql`. `docker-compose.yml` репо (:5532/:6479) — дрейф, не используется.
- **38 товаров = 29 published + 9 draft, у КАЖДОГО ровно 1 вариант** (вариаций нет, объём/вес вшит в название), SKU уникальны (артикулы WB/Ozon либо `PL-NN`, курсы `COURSE-*`). Категории: Добавки 19, АСД 6, Мёд 5, Фито-свечи 2, Антисептики 1, Масла 1, Мультиварки 1, Стевия 1, без категории 2 (курс + набор курса). Цены: у варианта по одной rub и usd; `metadata.i18n` пуст у всех; `product_translation` 51 строка (6 живых, все en). Опции many-to-many (Medusa 2.17.2). Полный список: `/Users/ivanprotsko/upready/projects/chrxnasdmds/artifacts/product-images-20260906/index.csv`.
- Источники: `~/upready/memory/chrxnasdmds-catalog-media-facts.md`; `~/upready/memory/upready-store-cherkashina-tenant-migration-2026-09-12.md`; `artifacts/product-images-20260906/README.md`.
- Дампы БД: `/Users/ivanprotsko/upready/projects/chrxnasdmds/backups/medusa_chrxn.pre-pricelist-sync-20260901-0610.dump` (последний, custom format), `backups/medusa_chrxn-postprice-2026-08-31.sql.gz`, `backups/medusa_chrxn-preprice-2026-08-31.sql.gz`, `backups/catalog-pre-restructure-20260831-1440.sql`, `backups/db/medusa_chrxn-pre-2.17-20260714-200547.dump`. Дамп от роли `medusa` пустой — только суперпользователь.

### 2.3 Изображения
| Набор | Путь | Объём | Что это |
|---|---|---|---|
| **Выгрузка картинок из БД (готова к импорту)** | `/Users/ivanprotsko/upready/projects/chrxnasdmds/artifacts/product-images-20260906/` | 34 папки `<SKU>__<handle>`, 331 файл, 115 МБ (233 webp, 57 png, 41 jpg) + `index.json`/`index.csv` (sku, product_id, handle, title, variant, category, status, rank, thumb, sha256) + скрипт `export-images.mjs` | Обложки помечены `01-thumb-*`, порядок = rank |
| Фотобанк по номерам прайса | `/Users/ivanprotsko/upready/projects/chrxnasdmds/catalog/` | 28 папок `NN-slug/`, 844 файла (602 webp + 242 jpg), 73 МБ; `_manifest.json` (сопоставление позиция→источники ozon/wb), `_covers/` 28 обложек, `_dedup-report.json`, `_ocr-raw.jsonl` | Копия: `handoff-data/catalog-2026-08-31/05-photos/` (843 файла) |
| Фотосет OLAVKA (Figma, 4 плотности) | `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/static/olavka-photoset/` | 112 файлов, 89 МБ; применён к 18 обложкам + 28 кадрам (коммит `40914209`), карта отката `backups/olavka-photoset-1788212707428.json` | вне git |
| Карточки OLAVKA (Figma) | `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/static/olavka-cards/` | 31 файл, 155 МБ | вне git |
| Фото с Ozon Оксаны | `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/storefront/public/products/oksana-ozon/<sku>/` | 850 файлов, 102 МБ | спарсено tools/ozon-parser |
| Фото поставщика WB «Фабрика Натуральных Продуктов» | `…/apps/storefront/public/products/wb-fabrika/<nm>/` | 1034 файла, 79 МБ | |
| Фото 5 позиций, заведённых 31.08 | `…/apps/storefront/public/products/pricelist-2026-08-31/PL-{09,21,26,28,35}/` | 36 файлов | |
| Полный WB-архив поставщика | `/Users/ivanprotsko/upready/projects/chrxnasdmds/docs/WB-data/` | 242 товара / 60 карточек, 3 431 фото товаров, 14 461 отзыв, 2 553 медиа отзывов, 1,3 ГБ; `products.clean.json` (import-ready), `wb_prices.csv`, `wb_all_reviews.json` | README внутри; вне git |
| Видео курса «Очищение печени» | `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/static/courses/` | 15 файлов, 2,1 ГБ | вне git |

### 2.4 Атрибуты, описания, тексты
- Описания/характеристики WB: `docs/WB-data/products.clean.json`, `handoff-data/catalog-2026-08-31/03-wb/cards/`. На 31.08: 73/73 товаров без subtitle, 36/73 без description (HANDOFF `t-2026-08-31-header-polish`).
- Seed-данные из Astro-зеркала (май): `apps/backend/src/data/products.json` (34 позиции, price_uah/eur), `categories.json` (10: АСД, Ветом, Тиофан, Иммуномодуляторы, Дополнительные позиции, Мази, Свечи, Гигиена, Косметика, Книги), `pages.json` (39 статей: slug, title, h1, outline). SEO-черновики: `.ai/drafts/articles/` (45 MDX).
- Курс «Очищение печени»: данные `packages/course-core/src/data/ochishchenie-pecheni.ts`, модуль `apps/backend/src/modules/course`, товары `COURSE-OCHISHCHENIE-PECHENI` и `COURSE-BOX-OCHISHCHENIE-PECHENI` (оба draft).

### 2.5 Что неполно
- 4 товара без картинок: `med-matochnyy-125-gr`, `med-trutnevoy-125-gr`, `nabor-dlya-ochischeniya-limfy`, `sulfat-magniya-75-gr`; 1 битая обложка `course-ochishchenie-pecheni-box` → `/products/course-box-pecheni-1.jpg` (404). Вопрос `q-2026-09-06-tovary-bez-kartinok`.
- 6 позиций прайса 36 — черновики без фото/описаний от Оксаны (№10, 11, 23, 33, 34, 36); 8 позиций без фото на 31.08 (`handoff-data/catalog-2026-08-31/README.md`).
- 5 позиций с ценой прайса на меньшей фасовке (`docs/catalog-pricelist/GAP-REPORT.md`, поле `gap` реестра); часть сопоставлений с низкой уверенностью (`matchConfidence`, `verdictReview`).
- Лечебные заявления в 16 из 38 карточек — красная линия модерации Robokassa (`docs/orchestration/2026-09-03-checkout-legal/report.md`, чек-лист G3).
- Ozon: 26 SKU из 76 allowlist не спарсены (HANDOFF `t-punch-g`).

---

## 3. Что построено и задеплоено

### 3.1 Стек
- Monorepo pnpm 9.15.9 + Turbo. Backend **Medusa 2.17.2** (`apps/backend`, :9101, админка `/app`, суперадмин `app@root.dev` / `@appR00t`). Storefront **Next 15.3.9 + React 19** (`apps/storefront`, :3101, главная `/ru/ru`). PG16 :5433, Redis :6379 (нативные).
- Модули Medusa (`apps/backend/src/modules/`): agent, ai-images, apiship, auth-yandex, blog, course, customer-identity, home-banners, locale, shipping, shipping-config, translation. Плагин `@medusajs/loyalty-plugin`. Файлы — `@medusajs/file-local` → `apps/backend/static/`.
- 28 workspace-пакетов `@upready/*` (`packages/`): agent-core/-react/-telegram/-openai/-anthropic/-claude-cli, auth-core, commerce-core, config-schema, course-core, renderer(-react), theme-runtime, widget-registry, banner-*, ai-image-*, license-runtime, control-plane, cli, ui и др.
- Прочие приложения: `apps/telegram` (бот-консультант Bot API + MTProto userbot + Mini App), `apps/school` (Astro-лендинг школы; Frappe LMS отменена Иваном 31.08), `apps/pricing` (Next + supabase, package.json отсутствует), `apps/docs` (Starlight, не обновлялся с 29.05).
- Env-переменные интеграций: `apps/backend/.env.template` (RESEND_API_KEY, EMAIL_FROM, TELEGRAM_BOT_TOKEN, STOREFRONT_URL, POCHTA_DEMO, YANDEX_CLIENT_ID/SECRET/CALLBACK_URL, OPENAI_API_KEY, FAL_KEY, EVOLINK_KEY); `apps/storefront/.env.template` (NEXT_PUBLIC_MANAGER_WHATSAPP/TELEGRAM/EMAIL, TELEGRAM_BOT_TOKEN, TG_SESSION_SECRET, AGENT_*, NEXT_PUBLIC_YANDEX_LOGIN_ENABLED). Секреты Robokassa/ApiShip — в `.env` живых серверов и `~/upready/memory/secrets/chrxnasdmds/` (`deploy/README.md`).

### 3.2 Функции витрины (по коду и HANDOFF)
Каталог/PDP/корзина-дровер/избранное/кабинет (8 тестовых персон), чекаут v2 (адрес → доставка с ПВЗ-картой → оплата Robokassa), юр. страницы `/terms` (оферта), `/privacy`, `/consent`, `/consent-marketing`, возвраты, контакты, cookie-consent, три чекбокса согласий, ИИ-агент-консультант в чате (OpenAI/Anthropic/claude-cli, owner-режим по долгому нажатию логотипа), голосовой виджет ElevenLabs (частично), TG-логин (выключен `c9bf6083`; признан незаконным по 406-ФЗ), Яндекс ID (код готов `dfec4ce9`, ждёт ClientID/secret), ИИ-баннеры главной, блог, курсы, ахроматическая тема «уголь» (`a0ef51e3`), галерея шаблонов `/0`, транзакционные письма Resend (`apps/backend/src/lib/email/resend.ts`, подписчик `order-email-notify.ts`).

### 3.3 Деплой и живое состояние
| Контур | Факт | Источник |
|---|---|---|
| **paleoluma.com** (Contabo `84.46.251.149`, Coolify) | = кольцо **dev**, контейнеры `chrxnasdmds-dev-*`, БД `chrxnasdmds`; админка фактически `https://api.paleoluma.com/shop/admin`. GitHub Actions мертвы с 27.07.2026 (бюджет минут); прод отстаёт от dev на 144 коммита (01.09), каталог там 112 товаров против 40. Смоук 7/7 на 31.08 (`deploy/scripts/smoke-store.mjs`). Локального ssh-ключа к Contabo нет (только в GH-секрете). Контейнер TG-бота в петле рестарта | `CLAUDE.md`; `deploy/MIGRATION.md` §3,5; `deploy/README.md`; `~/upready/memory/chrxnasdmds-olavka-deploy-topology.md` |
| **olavka.ru** (Рег.облако VPS `178.21.11.54`, ID 7936383, ssh-алиас `cherkashina_store`, 8,51 ₽/час) | Закрытое кольцо: апекс — заглушка «скоро открытие», `preview.olavka.ru` — витрина под basic-auth (логин `olavka`), `api.olavka.ru` — Medusa; всё под `noindex`. 5 контейнеров `olavka-prod-{postgres,redis,backend,storefront,gateway}`, образы `olavka-closed` собраны на сервере 02.09 22:22 (без темы «уголь»). Проверено 03.09 05:00: 200/200/401. **12.09 ssh к 178.21.11.54 — timeout**, состояние неизвестно. DNS olavka.ru всё ещё на 31.31.198.57. Переключатели `deploy/scripts/olavka-visibility.sh {open|closed|preview-auth on/off}` | `deploy/OLAVKA-CLOSED.md`; `~/upready/memory/chrxnasdmds-olavka-deploy-topology.md`; `~/upready/memory/upready-store-cherkashina-tenant-migration-2026-09-12.md` |
| Переносимый стек | `deploy/standalone/docker-compose.yml`, `docker-compose.olavka.yml`, `gateway/Caddyfile.standalone`/`.olavka`, `deploy/scripts/{backup-live,restore-to-host,preflight-env,release-cut,release-record,rollback}.sh`, `smoke-store.mjs` | `deploy/ACCESS-CHECKLIST.md`; `deploy/RELEASE-DISCIPLINE.md` |
| Замеры мощности | 4,8 стр/с, ~70 одновременных покупателей комфортно; реальная нагрузка 3 корзины/30 дней, 38 заказов за историю; БД 25 МБ, файлы товаров 2,1–2,3 ГБ | `deploy/MIGRATION.md` §1–2 |

Последняя записанная приёмка живого продукта: смоук paleoluma.com 7/7 (31.08) и проверка olavka-кольца 03.09; чекаут с СДЭК проверен живьём 01.09 на локальном :3101.

---

## 4. Требования клиента и решения

### 4.1 Из ТЗ 2026-05-13 (`docs/brief/cherkashina-tz-2026-05-13.md`)
- Первый запрос 20.03.2026: «Товарка. 20-30 товаров. Продажа по РФ, оплаты принимать, СДЭК». Референс — Instagram @avhustiin (asd2-3.com), «простой сайт», «сделать лучше».
- Модель на старт: витрина + ручная обработка заказа (менеджер считает доставку, даёт реквизиты). Доставка: Почта + DHL + СДЭК. Цены в USD. Язык — русский. Контакты: WhatsApp + Telegram + Viber. Юр. документы: политика, оферта, 18+ для БАДов, согласие ПДн. SEO-статьи — предложены AI-генерацией. Список 22 товаров с ценами (17 с ценой, 5 без).
- Здоровье клиента: «серьёзная проблема с глазами» — отвечает коротко; в офере предусмотрена озвучка экрана.

### 4.2 Решения, зафиксированные позже
| Дата | Решение | Источник |
|---|---|---|
| 2026-05-15 | Один товар = одна страница, модификации через Medusa options/variants | `docs/decisions/2026-05-15-product-variants.md` |
| 2026-05-29 | Код движка в `@upready/*`, бизнес-планы в `store-engine`; остаёмся на Next (не Astro) | `CLAUDE.md` |
| 2026-06-10 | Прод только на popova.help, Cloudflare proxy OFF | `deploy/README.md` |
| 2026-08-22 | Слой абстракции доставки: курьер скрыт, флоу «способ → ветка → код ПВЗ» (branch-first) — **отменено 03.09** | `.memory-legacy.md`; `~/upready/memory/chrxnasdmds-checkout-legal-decisions.md` |
| 2026-08-23/31 | «Каталог = прайс-лист»: лишнее скрыто обратимо; карточки разлеплены (66→0 нарушений гейта), 97→52 варианта; 36 позиций привязаны к живым вариантам | HANDOFF `t-2026-08-31-01`, `t-2026-08-31-catalog-pricelist` |
| 2026-08-30 | Работа над магазином ведётся из этого репо; ветка checkout-pvz не вливается целиком, @gorgo ApiShip не берём | `CLAUDE.md`; `.memory-legacy.md` |
| 2026-08-31 | 190 задач заморожены, режим «только по указанию Ивана»; школы Frappe LMS не будет; защита от перегруза не строится; виртуальный хостинг исключён | `CLAUDE.md`; `deploy/MIGRATION.md` |
| 2026-08-31 | Подвал: только реальные методы Robokassa + логотип эквайера; крипто/Stripe/PayPal/CDEK/DHL убраны | `.memory-legacy.md` (footer-payment-marks-robokassa-only) |
| 2026-09-01 | Юр. тексты продавцу шлём САМИ с местами под заполнение (не анкету): `~/upready/docs-projects/chrxnasdmds/legal-drafts/` (6 docx); пакет модерации Robokassa — `~/upready/docs-projects/chrxnasdmds/robokassa-moderation-docs/` | `.memory-legacy.md` |
| 2026-09-01 | Витрина сведена к прайсу 32: 43 карточки → 29 | коммит `0ef93e73`, `.ai/scripts/pricelist-sync-2026-09-01.mjs` |
| 2026-09-02 | Сервер Рег.облако (152-ФЗ), release discipline dev→stage→main, релизы тегами | `deploy/RELEASE-DISCIPLINE.md`, `deploy/BRANCHING.md` |
| 2026-09-03 | Чекаут: адрес → доставка; способ оплаты «другое» убран; срок доставки показывать (данные есть); Яндекс ID как полноценный auth-провайдер Medusa; БД/Redis отдельными сервисами; **требование Ивана: снять авто-aspect, все карточки 3:4 с contain** (развилка «катить или сначала картинки» открыта) | `~/upready/memory/chrxnasdmds-checkout-legal-decisions.md`; `~/upready/memory/chrxnasdmds-olavka-deploy-topology.md` |
| 2026-09-03 | TG-логин вне закона (406-ФЗ), Resend = трансгранка → нужен RU-почтовик; домен .com/Cloudflare допустимы только в режиме DNS only | `.memory-legacy.md` (legal-tg-login-resend-152fz, domain-zone-and-cloudflare-152fz) |
| 2026-09-04 | План Б по доменам: cherkashino.ru + черкашино.рф; смену данных админа делает Иван сам (14.09) | `~/upready/memory/chrxnasdmds-domains-cherkashino-2026-09-04.md` |
| 2026-09-15 | 16.09 целиком — магазин Оксаны на upready-store; ориентир функционала insales.ru/page/combo | `~/upready/memory/oksana-cherkashina-store-day-2026-09-16.md` |

### 4.3 Юр. блок и модерация Robokassa
- Тексты в коде: `apps/storefront/src/lib/legal/content/{offer,privacy,consent-pd,consent-marketing,returns,return-memo,contact}.ts` (markdown с `{{ТОКЕНАМИ}}`, только ru; 1180 строк всего), резолвер `apps/storefront/src/lib/legal/requisites.ts`. Незаполненные токены рендерятся буквально (намеренно).
- ТЗ юр. соответствия витрины (TR-01…56): `~/upready/docs-projects/chrxnasdmds/tz-legal-compliance-2026-07-03/`.
- Чек-лист монетизации (58 пунктов): `~/upready/projects/astro-quick-views/apps/legal-checklist/` — 18 закрыто, 31 ждёт данных Оксаны, 8 красных линий (лечебные заявления, нет ссылок Росаккредитации, и др.). Анкета продавца: `https://cherkashina-anketa.pages.dev` (ответы `GET /api/submit`).
- Требования Robokassa к сайту и запрещённые формулировки («БАД» под п. 9.1.5): `.memory-legacy.md` (robokassa-site-requirements-canon, moderation-blockers-2026-09-01).

### 4.4 Telegram
- `apps/telegram` — бот-консультант (telegraf, long-polling), userbot (MTProto), Mini App через `apps/storefront/api/tg-auth`; мозг `@upready/agent-core` + корпус `tools/agent-corpus`. Ветки `feature/tg-shop-flow`, `feature/tg-cart-login`. На проде контейнер бота в петле рестарта (`ERR_MODULE_NOT_FOUND tg-customer.ts`). Инструкция WB API-токена отправлена помощницам 14.09 (ответа нет).

---

## 5. Открытые вопросы и блокеры (HANDOFF.json + память)
1. `q-2026-09-06-tovary-bez-kartinok` — 4 товара без фото + 1 битая обложка: брать у Оксаны / снимать / скрывать?
2. `q-yandex-id-credentials` — ClientID + secret Яндекс ID (инструкция отдана Кире 04.09, новостей нет). Блокирует `t-2026-09-03-yandex-id`.
3. `q-yur-adres-bez-ulicy` — юр. адрес продавца: анкета дала только «г. Элиста».
4. `q-realnyy-email-prodavca` — реальный e-mail вместо `olavka@example.com`; совпадает ли с EMAIL_ДПО.
5. `q-soglasiya-tri-chekboksa` — схлопывать ли 3 чекбокса согласий (вердикт N5: акцепт оферты в текст над кнопкой, ПДн — отдельный контрол).
6. `q-otkrytie-olavka-ru-dlya-proverki` — открывать ли olavka.ru публично для модератора Robokassa; A-запись preview.olavka.ru в DNS не добавлена.
7. `q-chto-delat-s-ostavsheysya-hromatikoy` — цветные логотипы платёжек/свотчи/баннеры после схемы «уголь».
8. `q-2026-09-03-catalog-in-scope-c` — входит ли `/catalog/*` (17,3k LOC) в scope пересборки витрины.
- Блокеры вне HANDOFF: идентификация администратора доменов через Госуслуги не пройдена (14.09); модерация Robokassa не пройдена (нужны юр. адрес, e-mail, ссылки Росаккредитации, снять лечебные заявления); боевые ключи СДЭК (договор) и Почты (кабинет ИП не пускает, тикет ~03.09); `useReceipt` для 54-ФЗ; Resend → RU-почтовик; ssh к olavka-серверу 12.09 не отвечал; Иван отсутствовал в чате 06.09–14.09 (болезнь).
- Развилка Ивана (03.09, без ответа): катить dev как есть или сначала картинки 3:4 contain.

---

## 6. Переиспользуемые активы для миграции (что и как)
| Актив | Путь | Как использовать на upready-store |
|---|---|---|
| Прайс 32 позиции (USD) | `/Users/ivanprotsko/upready/docs-projects/chrxnasdmds/catalog-pricelist-2026-09-01/pricelist-canon.json` | источник названий и цен; курс 90,34 ₽/$ (31.08) или актуальный |
| Реестр 36 с маппингом SKU/фото/gap | `/Users/ivanprotsko/upready/projects/chrxnasdmds/data/catalog-pricelist/registry.json`, `handoff-data/catalog-2026-08-31/01-registry/positions.csv` | связка позиция → SKU → папка фото → расхождения |
| Картинки по SKU с метаданными | `/Users/ivanprotsko/upready/projects/chrxnasdmds/artifacts/product-images-20260906/` (`index.json`, папки `<SKU>__<handle>`) | прямой импорт: обложка = `01-thumb-*`, порядок = префикс NN |
| Фотобанк по позициям прайса | `/Users/ivanprotsko/upready/projects/chrxnasdmds/catalog/` + `_manifest.json`, `_covers/` | добор фото для позиций без картинок |
| Figma-фотосет и карточки | `apps/backend/static/olavka-photoset/`, `apps/backend/static/olavka-cards/`, карта `backups/olavka-photoset-1788212707428.json` | брендовые обложки 18 товаров |
| Описания/характеристики (WB) | `docs/WB-data/products.clean.json`, `handoff-data/catalog-2026-08-31/03-wb/cards/` | тексты карточек; фильтровать лечебные заявления |
| Отзывы | `docs/WB-data/wb_all_reviews.json` (14 461, по imtId), `reviews.by_card.json`; Ozon 141 отзыв (`tools/ozon-parser`) | если нужен блок отзывов |
| Дамп БД Medusa | `backups/medusa_chrxn.pre-pricelist-sync-20260901-0610.dump` (+ живая `medusa_chrxn@5433`) | миграция product/variant/price/image; уже опробовано 12.09 на ветке `feat/cherkashina-tenant` (`~/upready/worktrees/upready-store/feat/cherkashina-tenant`, артефакты `artifacts/docs/2026-09-12-cherkashina-migration/`) |
| Скрипты импорта/приёмки | `apps/backend/src/scripts/catalog/apply-pricelist-prices.ts`, `apps/backend/src/scripts/import-wb-products.ts`, `import-ozon-products.ts`, `scripts/accept-catalog.mjs`, `scripts/verify-registry.mjs`, `.ai/scripts/gate-catalog-variants.mjs`, `artifacts/product-images-20260906/export-images.mjs` | образцы для импорта в тенант и гейта «все позиции прайса живы» |
| Юр. тексты | `apps/storefront/src/lib/legal/content/*.ts`, `requisites.ts`; черновики docx `~/upready/docs-projects/chrxnasdmds/legal-drafts/`; ТЗ `~/upready/docs-projects/chrxnasdmds/tz-legal-compliance-2026-07-03/` | страницы offer/privacy/consent/returns тенанта (в upready-store ключей tenant_page только 5: contacts, legal, about, privacy, offer) |
| Реквизиты ИП | `apps/storefront/src/lib/legal/requisites.ts` (ФИО, ИНН, ОГРНИП, телефон, адрес возврата) | заполнить профиль тенанта; юр. адрес/e-mail — ждать |
| Robokassa | плагин `@gorgo/medusa-payment-robokassa@1.0.0` (`apps/backend/medusa-config.ts:293-320`), MerchantLogin OLAVKA, фикс подписи `885e70b6` | ставится на Medusa 2.19 без peer-конфликтов (проверено 12.09) |
| Доставка | `apps/backend/src/modules/{apiship,shipping,shipping-config}`, `apps/backend/src/lib/shipping/{apiship-client,cdek-client,pochta-tariff}.ts`, ПВЗ-пикер `apps/storefront/src/modules/checkout/components/unified-point-picker/` | ключи песочницы СДЭК edu.cdek.ru; боевые — договор |
| Яндекс ID | `apps/backend/src/modules/auth-yandex/`, `docs/auth-yandex.md`, инструкция для Ивана `docs/yandex-id-setup-instruction.{md,html}` | перенос провайдера; ждёт ClientID |
| Письма | `apps/backend/src/lib/email/resend.ts`, `subscribers/order-email-notify.ts` | Resend — трансгранка, для РФ нужен RU-провайдер |
| Логотип/бренд | графического логотипа не найдено (только текст «Черкашина Оксана»; `lib/data/brand-logos.ts` — логотипы брендов товаров, `payment-logo/` — платёжные марки) | не найдено |
| Курс «Очищение печени» | `packages/course-core/src/data/ochishchenie-pecheni.ts`, видео `apps/backend/static/courses/` (2,1 ГБ), статьи `.ai/drafts/articles/` | если курс входит в scope |
| SEO-статьи | `apps/backend/src/data/pages.json` (39), `.ai/drafts/articles/` (45 MDX) | блог тенанта |
| Деплой-скрипты | `deploy/standalone/`, `deploy/scripts/{backup-live,restore-to-host,smoke-store.mjs,olavka-visibility.sh}` | смоук по живому и переключатели видимости |
| Переписка с клиентом | `~/upready/.private/telegram-analyses/2026-09-15-oksana-store/`, `~/upready/docs-projects/chrxnasdmds/client-chat-analysis-2026-05-21.md` | ПДн, вне git |

---

## 7. Хронология
| Дата | Событие | Источник |
|---|---|---|
| 2026-03-20 | Первый запрос Оксаны («товарка, 20-30 товаров, РФ, СДЭК») | `docs/brief/cherkashina-tz-2026-05-13.md` |
| 2026-04-26 | Первый коммит репо (`3345da35`, форк Lanalu marketplace) | `git log --reverse` |
| 2026-05-13 | ТЗ и preview `chrxnasd-preview.pages.dev`; список 22 товаров | `docs/brief/` |
| 2026-05-17 | HANDOFF переведён в JSON; корпус БД 56 товаров | `.handoff-archive/HANDOFF-pre-json-2026-05-17.md` |
| 2026-05-20…29 | Кольца dev/stage/prod на Contabo; презентации/офферы Оксане (`oksana-calc-v3`); выделение store-engine | `deploy/README.md`, `PROJECT-MAP.md` |
| 2026-06-18 | Оффер Оксане (магазин + курсы, 200К первый транш) | `PROJECT-MAP.md` |
| 2026-07-03 | Инцидент TG-логина 14 ч; ТЗ юр. соответствия | `CLAUDE.md` |
| 2026-07-14 | Апгрейд Medusa 2.17 (бэкап pre-2.17) | `backups/db/` |
| 2026-07-27 | GitHub Actions остановлены (бюджет) | `CLAUDE.md` |
| 2026-08-04 | Прайс PDF 32 позиции + 4 в Telegram | `handoff-data/catalog-2026-08-31/02-sources/` |
| 2026-08-06 | Магазины офлайн (Vercel paused, контейнеры stopped) | `.memory-legacy.md` |
| 2026-08-22…24 | Слой доставки, ApiShip/СДЭК тест-режим, матрица 45 служб | `.memory-legacy.md` |
| 2026-08-30 | Работа возвращена в этот репо; развилки доставки закрыты | `CLAUDE.md` |
| 2026-08-31 | Заморозка 190 задач; каталог=прайс (30/36 live), разлепление карточек; реквизиты ЕГРИП; подготовка переезда | HANDOFF, `deploy/MIGRATION.md` |
| 2026-09-01 | Фотосет OLAVKA применён; новый прайс 32; витрина сведена 43→29; СДЭК проверен живьём | коммиты `40914209`, `0ef93e73` |
| 2026-09-02 | VPS Рег.облако куплен (178.21.11.54); release discipline; закрытое кольцо olavka.ru | `deploy/OLAVKA-CLOSED.md` |
| 2026-09-03 | Оркестрация чекаут+юр. блок (волна 1 закоммичена, пауза по слову Ивана); Яндекс ID код; тема «уголь» | `docs/orchestration/2026-09-03-checkout-legal/report.md` |
| 2026-09-04 | Домены cherkashino.ru/черкашино.рф; инструкция Яндекс ID отдана Кире | память domains |
| 2026-09-06 | Последний коммит: выгрузка 331 картинки, вопрос про 5 товаров без фото | `HANDOFF.json` status |
| 2026-09-12 | Пробная миграция тенанта `cherkashino` в upready-store (ветка `feat/cherkashina-tenant`); olavka-сервер по ssh не ответил | `~/upready/memory/upready-store-cherkashina-tenant-migration-2026-09-12.md` |
| 2026-09-14 | Тикеты reg.ru отклонены; решение Ивана менять данные админа самому | память domains |

Коммитов всего 1344 (04: 217, 05: 391, 06: 368, 07: 168, 08: 137, 09: 63). Remote `https://github.com/ivanprotsko/chrxnasdmds.git`; 60+ веток, ~55 worktrees (`git worktree list`), незакоммиченных мержей нет (dev clean на 06.09).

## Не найдено
- Графический логотип магазина; фирменные цвета вне схемы «уголь»; Viber/WhatsApp-ссылки (переменные `NEXT_PUBLIC_MANAGER_*` пусты в `.env.local`); подтверждённый рабочий e-mail и полный юр. адрес продавца; боевые ключи СДЭК/Почты; ответ поддержки reg.ru; `.ai/orchestrator-board.json` актуален только на 2026-05-23 (калькулятор/UX-лейны, к магазину не относится).
