# Миграция магазина Оксаны Черкашиной в upready-store как тенанта `cherkashino` — отчёт

Сгенерировано 2026-09-12 11:00 WITA из записей каталога `artifacts/docs/2026-09-12-cherkashina-migration/` (00-source-measure.json 2026-09-12 10:10 WITA, 02-mapping-registry.json 2026-09-12 10:59 WITA, shots/checks.json 2026-09-12T02:59:48.596Z). Ветка `feat/cherkashina-tenant` от `fix/mt-storefront-head-footer` 8dba58c. Прод не трогался, деплоя не было (17b/21c).

## Что открыть Ивану

- Витрина тенанта на локальном стенде: http://cherkashino.localhost:8043/ru (главная), http://cherkashino.localhost:8043/ru/store (каталог), http://cherkashino.localhost:8043/ru/pages/offer (оферта), http://cherkashino.localhost:8043/ru/pages/contacts, http://cherkashino.localhost:8043/ru/pages/privacy, http://cherkashino.localhost:8043/ru/pages/about; английская версия — замените `/ru` на `/en`.
- Стенд: бэкенд :9033 (БД `upready_store_cherkashina`, копия `upready_store_mt`), витрина :8043 (`next dev` без turbopack). Владелец тенанта на стенде: owner-cherkashino@example.test / `supersecret1` (панель не поднималась, /tenants/* проверялись скриптом и curl).
- Кадры 1280×900 и 390×844 (PNG вне git): `shots/` — home, catalog, product-svechi-asd-s-chesnokom-10-sht-cherkashino, page-{contacts,offer,privacy,about-ru,about-en}; DOM-проверки — `shots/checks.json`.

## Источник и цель: счётчики бок о бок

Источник — локальная `medusa_chrxn@127.0.0.1:5433` (SQL в 00-source-measure.json). Цель — тенант `ten_01M29Q4KYQHC70JZBENWZ8Z88M` в `upready_store_cherkashina` (SQL по таблицам линков `tenant_tenant_product_product`/`…_product_category`, 03-target-measure.json). Живое кольцо olavka.ru: ssh до 178.21.11.54:22 отвечал «Operation timed out» в 10:0x и 10:53 WITA — **живая БД не замерена**, источником миграции служит локальная копия; paleoluma.com (Contabo) без ключа — не замерено.

| Набор | Источник | Цель | Комментарий |
|---|---|---|---|
| Товары | 38 (draft 9, published 29) | 38 (draft 9, published 29) | статус сохранён; handle с суффиксом `-cherkashino` |
| Варианты | 38 | 38 | по одному на товар; SKU с суффиксом `-CHERKASHINO`, исходный SKU в metadata.source_sku |
| Категории | 9 (плоские) | 9 | линк tenant↔category |
| Связи товар↔категория | 131 (все, включая 139 удалённых товаров) / 36 у живых | 36 | |
| Картинки галереи | 313 | 313 | порядок = rank источника |
| Товары с thumbnail | 34 | 33 | −1: битая ссылка источника |
| Цены | eur 2, rub 40, usd 98 (с ценами удалённых вариантов) | eur 2, rub 38, usd 38 | по валюте на вариант: rub+usd у каждого, eur у 2 |
| Переводы товаров | 51 строк, 6 у живых (en) | 6 | модуль переводов Medusa (title, description) |
| Страницы контента | 11 живых страниц (7 легальных md + 4 из ключей UI) | en 1, ru 4 | ключей tenant_page только 5 — см. «не перенесено» |
| Главная | 3 баннера карусели | 1 документ | баннер #1 → hero; #2–#3 ждут решения |
| Файлы | 335 URL, 334 на диске | 334 в `static/tenants/ten_01M29Q4KYQHC70JZBENWZ8Z88M/` | загружены через POST /tenants/uploads |

## Реестр: сводка по видам (02-mapping-registry.json)

| Вид | Всего | migrated | skipped | pending | failed |
|---|---|---|---|---|---|
| tenant | 1 | 1 | 0 | 0 | 0 |
| dataset | 20 | 0 | 13 | 7 | 0 |
| category | 9 | 9 | 0 | 0 | 0 |
| file | 335 | 334 | 1 | 0 | 0 |
| product | 38 | 38 | 0 | 0 | 0 |
| page | 16 | 5 | 1 | 10 | 0 |
| legacy_page | 39 | 0 | 39 | 0 | 0 |
| banner | 3 | 1 | 0 | 2 | 0 |
| layout_configuration | 1 | 0 | 1 | 0 | 0 |
| variant | 38 | 38 | 0 | 0 | 0 |
| price | 78 | 78 | 0 | 0 | 0 |
| category_link | 36 | 36 | 0 | 0 | 0 |
| image | 336 | 331 | 5 | 0 | 0 |
| product_translation | 6 | 6 | 0 | 0 | 0 |

## Перенесено (2.1–2.3)

- **Товары 2.1**: 38 из 38 с принадлежностью к категориям (36 связей), ценами (78), статусами (draft остались draft), полным metadata источника (+ `source_id/source_handle/source_url/source_type/source_tags`). Обе пометки картинок: `card_image` = product.thumbnail источника → thumbnail цели (карточка списка), `pdp_default_image` = картинка rank 0 → images[0] цели (первая на странице товара). У 19 товаров карточка и первая картинка PDP — разные файлы; проверено на живой витрине DOM-ом: card_image_matches=true (на home), pdp_default_matches=true для `svechi-asd-s-chesnokom-10-sht-cherkashino`.
- **Локализации 2.3**: 6 переводов товаров (en) записаны в модуль переводов цели; страницы — ru-строки и en там, где у источника был отдельный английский текст (about); главная — hero с `i18n.en`. У товаров источника `metadata.i18n` пуст у всех 38 (замер), локализация была только в `product_translation`.
- **Страницы 2.2**: contact/ru → `contacts`, terms/ru → `offer`, privacy/ru → `privacy`, about/ru → `about`, about/en → `about`. Легальные тексты перенесены как markdown с `{{ПЛЕЙСХОЛДЕРАМИ}}` дословно (реквизиты — от Ивана/Оксаны, не выдумывались): contact 6, terms 8, privacy 10. Все 15 документов (в т.ч. не имеющие ключа) лежат в `pages/<slug>.<locale>.md`.
- **Главная**: баннер «Заказ от 5 кг — скидка 10%» → hero документа тенанта (заголовок, подзаголовок, CTA, картинка `hero-botanical.webp`, en-версия), тема `supplements`, режим light; плитки категорий и лента «popular».

## Не перенесено и почему (2.4 и ограничения цели)

| Набор | Кол-во | Статус | Рекомендация |
|---|---|---|---|
| customers | 46 | pending | customers (46) are NOT migrated by default — question to Ivan: consent/legal basis for moving personal data between operators; recommendation: do not migrate, re-registration on the new site |
| orders | 88 | pending | orders (88) are NOT migrated by default — history stays in the source ring; recommendation: export the order list as an archive for Oksana, do not re-create orders |
| reviews | 332 | pending | customer reviews live as translation rows (resource review, en+ru, 332 each); the target has no reviews feature — recommendation: keep the export, revisit when a reviews block exists |
| articles | 18 | pending | journal articles (18 = 9 ru + 9 en, module blog); the target has no blog — recommendation: decide with Ivan (port the blog module or publish as static pages) |
| courses | 2 | pending | courses (2) + entitlements (10) + progress (37) — the course engine is not in the target; recommendation: not part of the shop tenant |
| pickup_point_records | 3 | skipped | manual pickup datasets (3) belong to the carrier-abstraction layer — follows the ApiShip/shipping port decision |
| order_tracking | 0 | skipped | 0 rows |
| loyalty_gift_cards | 0 | skipped | 0 rows |
| agent_conversations | 50 | skipped | AI agent dialogues (50) — the agent chat is not in the target; not customer data of the shop |
| ai_image_generations | 4 | skipped | AI image generation log (4) — tooling state |
| auth_identities | 34 | skipped | 34 emailpass identities of customers/admins — never migrated (password hashes stay with the operator); no telegram/yandex provider rows exist |
| email_link_codes | 3 | skipped | Telegram login codes (3) — transient |
| ui_translations | 910 | skipped | 910 UI keys × ru/en override the SOURCE storefront's own strings; the target storefront has different keys — only the page texts were carried over (see kind page) |
| product_types | 8 | skipped | global reference data in Medusa (no tenant-scoped create): value kept in product metadata.source_type; matched to a global type when one with the same value exists |
| product_tags | 14 | skipped | same as types: metadata.source_tags (4 product↔tag links in the source) |
| collections | 2 | skipped | 2 collections (bestsellers, new-arrivals) with 0 products assigned — nothing to carry |
| regions | 2 | skipped | source regions (Россия и СНГ rub, US usd) are store-wide infrastructure; target already has Russia/rub, United States/usd, Germany/eur |
| site_locales | 2 | pending | source locales ru (default) + en → tenant needs default ru; per-tenant locale/currency is the open decision of the wave-2 track (STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN not touched) |
| shipping_options | 2 | pending | 2 abstract options (Курьером до двери / Заберу сам, provider shipping_shipping, calculated) — depend on porting the carrier-abstraction provider; the tenant warehouse comes with the platform's default options |
| review_translations | 332 | skipped | see reviews |

Страницы без ключа в `tenant_page` (ключи только contacts|legal|about|privacy|offer): returns/ru, consent/ru, consent-marketing/ru, return-memo/ru, delivery/ru, faq/ru, wholesale/ru, delivery/en, faq/en, wholesale/en — тексты сохранены в `pages/`, на сайте их нет. Legacy `pages.json` (39 записей старого Astro-зеркала): не переносить; единственная с маршрутом — `pages/bundle-assortment` — воссоздать вручную только если нужна Оксане.

## Инвентарь фич (задача 1, 01-feature-inventory.md)

| Фича | В цели | Вердикт | Оценка |
|---|---|---|---|
| ApiShip fulfillment provider (Почта России + СДЭК via apiship.ru) | no | **port_later** | M (2–3 days: provider options resolved per tenant + routes under /store with tenant scope + seam tests) |
| Carrier-abstraction fulfillment provider `shipping` (abstract «courier / pickup» methods, weight tariffs, carrier router) | no | **port_later** | L (commerce-core extraction + provider + per-tenant config: 4–6 days) |
| shipping-config module (manual pickup datasets, manual order tracking, admin views) | no | **port_later** | M |
| Store shipping routes + checkout pickup UI (point picker, unified picker, Yandex map) | partial | **port_later** | M |
| Robokassa payment (plugin @gorgo/medusa-payment-robokassa 1.0.0 + pnpm patch) | no | **ask_ivan** | M (a: 2 days + Robokassa moderation of the new domain; b: spike 1 day first) |
| Payment UI: capture-payment return route, payment components, method select, MIR logo | partial | **port_later** | S–M |
| locale module (owner-enabled storefront languages, default locale) | partial | **port_later** | S once the decision lands |
| translation module (owner overrides of UI strings + reviews) and product overrides (DB > metadata.i18n > canon) | partial | **drop** | n/a |
| Legal pages (offer, privacy, consents, returns, return memo, contact) as markdown with {{PLACEHOLDER}} requisites | partial | **port_now** | done for 3 of 7 pages; S for the key extension |
| Home banners module (hero carousel, 3 banners with i18n) | partial | **drop** | n/a |
| Blog / journal (module blog, 18 articles = 9 ru + 9 en, admin route) | no | **ask_ivan** | M |
| Courses + school (course module, entitlements, progress, grant-course-on-paid subscriber, course-core package) | no | **drop** | n/a |
| Telegram login (email-link codes, customer-identity module) and Telegram order notifications | no | **port_later** | S (notifications) / M (login) |
| Yandex ID auth provider | no | **drop** | n/a |
| AI agent chat (module agent, store route, storefront agent-demo, image-gen port) | no | **drop** | n/a |
| Loyalty plugin (@medusajs/loyalty-plugin) | no | **drop** | n/a |
| Transactional email via Resend (order emails, email-link) | partial | **drop** | n/a |
| set-product-aspect subscriber (image aspect ratio into product.metadata.aspect_ratio) | no | **drop** | n/a |
| Admin extensions of chrxnasdmds (routes blog, home-banners, localizations, payment-methods, shipping-services, shipping-tracking, translations, warehouse-shipments; widgets command-palette, product-translations, hide-native-translations-action) | no | **drop** | n/a |
| Catalog data (38 products, 9 categories, 313 images, prices rub/usd/eur, 6 en product translations), content pages, home hero | yes | **port_now** | done on the local stand |

Факты, подтверждённые чтением: `apps/backend/medusa-config.ts` цели не регистрирует ни платёжного, ни fulfillment-провайдера (дефолты Medusa) — обе интеграции здесь новые. `@gorgo/medusa-payment-robokassa@1.0.0`: peer `@medusajs/* ^2.14.0`, реальная установка в worktree на 2.19.0 прошла без своих peer-конфликтов (предупреждения в логе — от `@medusajs/dashboard`/`admin-bundler`), файл, который правит pnpm-patch, на месте; манифест после проверки откатили. Latest `2.0.0-beta.4` требует `@gorgo/medusa-integration ≥0.1.5` — плагин, который цель уже регистрирует с `providers: []` (docs.gorgojs.com: секреты шифруются AES-256-GCM в БД, «несколько экземпляров одного провайдера», привязка к тенанту не описана).

## Изменения продуктового кода на ветке (без них приёмка невозможна)

1. `apps/backend/medusa-config.ts`: локальный файловый провайдер получает `backend_url` из `MEDUSA_BACKEND_URL`. Замер: `@medusajs/file-local` читает только опцию `backend_url` (дефолт `http://localhost:9000/static`), на транке модуль не настроен → 334 загрузки на :9033 вернули адреса :9000, витрина показывала битые картинки. **На проде та же дыра**: `deploy/compose.mt.yml` не задаёт S3 и `MEDUSA_BACKEND_URL` для mt-backend, значит всё, что владельцы загружают через панель, получает `localhost:9000` (по живому проду не проверено — предложение задачи ниже). URL уже загруженных файлов перепривязаны скриптом `rehost-images.mjs` (проверка 200 по новому адресу перед записью).
2. `/store/tenant/pages` и `/store/tenant/pages/:key` отвечают в локали посетителя (`req.locale` фреймворка: `?locale=`, затем `x-medusa-locale`) с фолбэком язык → en → любая; витрина (`lib/data/tenant-pages.ts`) шлёт локаль и держит кэш по языкам. До этого публичные маршруты читали только `en` — магазин с русским по умолчанию был нечитаем. Seam-тест `tenants-pages.spec.ts`: 9/9 (новый кейс на фолбэк).

## Скрипты (apps/backend/scripts/cherkashina-migration/)

`measure-source.mjs` (замер, число рядом с SQL) · `export-source.mjs` (снимок источника, только чтение) · `import.mjs` (идемпотентный импорт через /tenants/*, `--dry-run`, реестр по ходу, exit 1 при failed; повтор даёт 0 созданных) · `rehost-images.mjs` · `render-registry.mjs` · `feature-inventory.mjs` · `render-report.mjs`; переводы товаров — `src/scripts/cherkashina-translate-products.ts` через `medusa exec` (createTranslationsWorkflow). Источник читался только (cat/psql), запись — ни в БД, ни в репозиторий chrxnasdmds.

## Вопросы Ивану (по одному, каждый с рекомендацией; отвечать можно по очереди)

1. **Пер-тенантные секреты интеграций (развилка дизайна, блокирует код Robokassa/ApiShip).** Один бэкенд на всех тенантов, а Robokassa (MerchantLogin OLAVKA, пароли 1/2, тестовые) и ApiShip (токен, адрес отправителя) — свойства магазина. Рекомендация: опции провайдера разрешаются на каждом вызове по тенанту из tenant-scoped записи секретов (шифрование как у `@gorgo/medusa-integration`, `INTEGRATION_ENCRYPTION_KEY`), привязка через sales channel / регион тенанта; env оставляет только платформенное. Сначала спайк на 1 день: умеет ли `@gorgo/medusa-integration` «несколько экземпляров провайдера» разводить по тенанту — если да, берём Robokassa 2.0 через него, если нет — 1.0.0 + patch со своей таблицей секретов.
2. **Покупатели (46) и заказы (88)** — по умолчанию не переносятся. Рекомендация: не переносить; выгрузить архив заказов для Оксаны из источника, покупатели регистрируются заново (согласие на передачу ПДн между операторами не оформлено).
3. **Страницы без ключа** (delivery, faq, wholesale, returns, consent, consent-marketing, return-memo) и статьи журнала (18). Рекомендация: расширить `TENANT_PAGE_KEYS` (модель + панель + футер) свободными ключами; журнал — отдельное решение (порт модуля blog или страницы).

## Предложения задач (заводит Иван, 22j)

- **Загрузки владельца на проде получают `localhost:9000`**: критерий — файл, загруженный через панель на прод-тенанте, открывается по публичному URL; `compose.mt.yml` задаёт `MEDUSA_BACKEND_URL` (или S3) для mt-backend.
- **Фильтры каталога по опциям**: у 38 товаров 38 собственных опций (Количество/Фасовка/Объём…) → в `/ru/store` ряд из ~25 чипов «Кол..», «Фас..» (та же природа, что `t-2026-09-12-seed-option-filter-duplicates`); критерий — один фильтр на одинаковое название опции.
- **Hero главной для магазина с собственным текстом/картинкой**: вариант «h» рисует три фото коллекции и игнорирует `image_url`; критерий — документ тенанта с hero-текстом и картинкой виден на главной в выбранной композиции (см. checks.json/home).
- **Редиректы со старых URL**: таблица старый→новый для 38 товаров и 9 категорий в 02-mapping-registry.md (`https://olavka.ru/ru/ru/products/<handle>` → `/<locale>/products/<handle>-cherkashino`); olavka.ru живёт до 2027-07-19, cherkashino.ru/черкашино.рф куплены 2026-09-03 — постраничные 301 по политике `specs/tenant-address/CANONICAL.md`.
- **Локаль/валюта тенанта**: нужен ru по умолчанию + en, ₽ на ru; решение по переносу `STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN` в документ тенанта ждёт Ивана (трек wave-2).
- **Реквизиты**: 16 уникальных плейсхолдеров в легальных страницах ({{ФИО_ИП}}, {{ОГРНИП}}, {{ИНН}}, {{ЮР_АДРЕС}}, {{ТЕЛЕФОН}}, {{EMAIL}}, {{СПОСОБЫ_ДОСТАВКИ}}, {{ДАТА_ВСТУПЛЕНИЯ}}, {{ДАТА_РЕДАКЦИИ}}, {{ДАТА_УВЕДОМЛЕНИЯ_РКН}}, {{РКН_РЕГ_НОМЕР}}, {{EMAIL_ДПО}}, {{ДОМЕН_САЙТА}}, {{ДАТА_ДОКУМЕНТА}}, {{ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ}}, {{АДРЕС_ВОЗВРАТА}}) — заполняются данными от Оксаны через панель, генератора подстановки в цели нет.

## Замечания приёмки

- Название тенанта задано «Оксана Черкашина» (в `store.name` источника — «Oksansa Cherkashina», опечатка); handle `cherkashino` — предложение, финальное имя за Иваном.
- 5 товаров без картинок на цели ровно как в источнике: 4 без единого изображения и 1 с битой ссылкой (`course-ochishchenie-pecheni-box`); ничего не выдумывалось.
- Цена с правилом региона в источнике (1 строка) не переносилась — регионы цели другие; в реестре нет строк price со статусом ≠ migrated, потому что эта цена принадлежит удалённому варианту.
- Категории источника без картинок → плитки категорий на главной цели пустые (плитка требует `metadata.image_url`).
