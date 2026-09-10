# Панель тенанта — волна 2 (ночь 11→12.09.2026). Бриф оркестратору

Автор: session_01HqysBVaN4S8qDwkauRQdvB (сессия-приёмщик волны 1), 11.09 ~07:20 WITA.
Источник задания — слова Ивана 11.09 07:1x, дословно ключевое:

> «когда будут готовы остальные части админки, по ним есть ТЗ о том что там должно быть?
> В админке нужны следующие разделы: категории товаров; промо; контент-разделы (контактная
> информация, юридические реквизиты, о магазине, политика конфиденциальности, публичная оферта);
> настройки главной страницы (hero; какие блоки показывать: категории; товары — популярное,
> товары конкретной категории). Посмотри какие разделы есть в Mercur … по коду бекенда и
> фронтенда, составь ТЗ и начни внедрение.»

ТЗ до этого момента НЕ существовало — этот документ и есть ТЗ v0. Правит его Иван.

## 1. Состояние на входе (замерено 11.09 07:00–07:15)

- Волна 1 принята 06:44: `artifacts/docs/2026-09-11-tenant-panel-morning.md` (вердикт), `…-night.md` (отчёт оркестратора). Код слит в `feat/mt-vendors` (merge-коммит от 07:2x).
- Панель `apps/tenant-panel` (Vite, копия экранов админки 2.19.0 + свой слой `hooks/api` на `/tenants/*`). Маршруты (`src/app.tsx`): `/` обзор, `/products` список, `/products/create`, `/orders` список, `/login`. **Заглушки `routes/not-built`**: `/products/:id`, `/orders/:id`, `/orders/export`. Всё остальное (в т.ч. `/settings/profile` из user-menu) падает в `path:"*"` → `routes/no-match` = страница 404. Ссылка на `/settings/translations/edit` в действиях строки товара — тоже мёртвая.
- Backend `apps/backend/src/api/tenants/`: `me`, `products`, `products/[id]`, `orders`, `uploads` (реэкспорт админского — файлы НЕ скоупятся по тенанту), `product-categories`, `collections`, `product-tags`, `product-types`, `product-options`, `inventory-items`, `regions`, `sales-channels(/[id])`, `shipping-profiles`, `price-preferences`, `store` — справочники для формы создания товара. Контракт: `docs/tenant-panel/api-contract.md`.
- Модуль `modules/tenant`: `tenant` (id, handle, name, metadata), `tenant_admin`; links `tenant-sales-channel`, `tenant-api-key`, `tenant-product`, `tenant-order`. Workflows: `create-tenant`, `create-tenant-product`, `link-order-to-tenant`, `provision-tenant-warehouse`.
- Витрина (`apps/storefront`, :8000/:8001/:8002 по env-ключу): главная = promo-banner + profile-hero + 4 category-tile, товаров на главной 0; товары на `/en/store` (9/3/1 карточек). Кэш `force-cache` — после любого изменения каталога `POST /api/revalidate` (см. отчёт приёмки).
- Стенд: backend :9023 (`medusa develop` из `apps/backend`), панель :5180, админка :9023/app; креды `~/upready/memory/secrets/upready-store/local-mt-stand.txt`.

## 2. Инвентарь Mercur 2.3.3 (панель продавца) — что там есть

Замер по `@mercurjs/core` `dist/api/vendor/**` (маршруты) и по бандлу `@mercurjs/vendor` (подписи сайдбара) + скриншоты Ивана.

Сайдбар: **Orders** (внутри — returns, claims, exchanges, order-edits, fulfillments, payments/capture/refund) · **Products** → Offers, Collections, Categories · **Inventory** → Reservations · **Customers** → Customer Groups · **Promotions** → Campaigns · **Price Lists** · **Reviews** · **Payouts** / Commission · **Settings**: Profile, Store (описание, handle, email, телефон, сайт, валюта; блоки Address, Company Details, Payment Details, Time off), Users (invite + роли/RBAC), Product Types, Product Tags, Locations & Shipping (stock locations, fulfillment sets/service zones, shipping options + правила, shipping profiles).
API сверх этого: `sellers/*` (адрес, реквизиты компании, payment details, members/invites), `stores` (валюты), `uploads`, `currencies`, `refund-reasons`, `return-reasons`, `feature-flags`, `rbac/me/permissions`.

Как Mercur скоупит: каждая сущность продавца связана с `seller` через links (seller↔product, seller↔order, seller↔promotion, seller↔customer …) — тот же приём, что наши `tenant-product`/`tenant-order`. Ловушка `allowed` со звёздами в query-config — в памяти `decisions/2026-09-10-multitenancy-target-first-config-in-db.md`, раздел «ловушка allowed»: **в наших `/tenants/*` `allowed` либо отсутствует, либо без `*`**.

## 3. Целевой список разделов панели (ТЗ v0)

| # | Раздел | Откуда | Волна 2 (эта ночь) | Примечание |
|---|---|---|---|---|
| 1 | Товар: карточка/редактирование (`/products/:id` + подмаршруты админки: edit, media, options, variants, prices, organize, attributes, sales-channels, metadata) | Иван 1.1 | **да** | копия `routes/products/product-detail/**` + все `/tenants/products/[id]/*` действия |
| 2 | Заказ: карточка (`/orders/:id`) — просмотр, fulfillment/shipment, capture платежа, cancel; returns/claims/exchanges — только просмотр | Иван 1.2 | **да** (действия — минимум: fulfill, ship, capture, cancel) | копия `routes/orders/order-detail/**`; heavy — резать по подмаршрутам |
| 3 | Экспорт заказов (`/orders/export`) | заглушка | да | CSV по своим заказам |
| 4 | Профиль тенант-админа (`/settings/profile`: имя, email, язык, смена пароля) + чинить user-menu | 404 у Ивана | **да** | `GET/POST /tenants/me`, пароль через auth module `update` |
| 5 | Категории товаров (список, дерево, создание, редактирование, привязка товаров) | Иван 5.1 | **да** | категории в Medusa ГЛОБАЛЬНЫ (без канала) → link `tenant-product-category` по образцу `tenant-product`; проверить по `@medusajs/product` до кода |
| 6 | Промо (promotions + campaigns) | Иван 5.1 | **да** | link `tenant-promotion`; чтобы промо действовало только в канале тенанта — правило `sales_channel_id` при создании (ПРОВЕРИТЬ по `GET /admin/promotions/rule-attribute-options/rules` на живом :9023, не по памяти) |
| 7 | Контент-разделы: контакты, юр. реквизиты, о магазине, политика конфиденциальности, публичная оферта | Иван 5.1 | **да** | новая модель `tenant_page` в `modules/tenant` (tenant_id, key ∈ {contacts, legal, about, privacy, offer}, title, body (markdown), locale, published); `GET/PUT /tenants/pages/:key`; публичный `GET /store/tenant/pages/:key` по publishable key → канал → тенант; витрина: страницы + ссылки в футере |
| 8 | Настройки главной: hero (вкл/выкл, заголовок, подзаголовок, CTA, картинка), блоки (категории; товары: популярное / товары категории X), порядок | Иван 5.1 | **да, последним куском** | модель `tenant_home_config` (JSON-композиция) + `GET/PUT /tenants/home`, публичный `GET /store/tenant/home`; витрина читает и рендерит. **Одна схема на всех:** сначала прочитать `feat/stands-composition` (задача `t-2026-09-09-02`, «панель настроек → композиция блоков») и взять её схему; своей второй не заводить. Если там схемы нет — минимальная своя + запись развилки в `…-night.md` |
| 9 | Коллекции | Mercur | нет | как 5, позже |
| 10 | Клиенты / группы | Mercur | нет | клиенты глобальны; «свои» = по заказам канала — дизайн отдельно |
| 11 | Склад/резервы, Locations & Shipping, Price Lists, Reviews, Payouts/Commission, Users/RBAC, Time off | Mercur | нет | вторая очередь; склад per-tenant уже провижнится при создании |

Язык панели: сейчас английский по всему периметру (i18n админки вырезан при копировании). В волне 2 НЕ переводить — отдельная задача после решения Ивана.

## 4. Механизм (не менять)

- Экраны = файлы админки `@medusajs/dashboard` 2.19.0 **как есть**; меняется только слой `hooks/api/*` → `/tenants/*` (форма ответов админки `{<plural>, count, offset, limit}`). Сравнимость по скриншоту и по коду — критерий Ивана.
- Изоляция — links (`tenant-*`), фильтр по link в каждом GET; POST/PUT/DELETE проверяют владение (404, не 403, как в волне 1).
- Витрина видит контент/настройки через `/store/*` по publishable key (ключ → sales channel → tenant по links).
- Ловушки из волны 1 (в памяти, раздел «Интеграция ночной волны 11.09»): `allowed` без `*`; «двойной диалог» = паритет с админкой; seam-suite только с `DB_HOST=localhost DB_USERNAME=ivanprotsko PORT=9031`; кэш витрины → `POST /api/revalidate`.

## 5. Приёмка (каждый кусок — в том же коммите, s4)

- seam-тесты `integration-tests/http/tenants.spec.ts` (+ новые файлы по разделам) зелёные с изоляцией: строка тенанта A не читается/не правится токеном B.
- e2e панели `apps/tenant-panel/e2e/tenant-panel.e2e.mjs` расширен на новые экраны, зелёный на живой :5180.
- `tsc --noEmit` и eslint в `apps/tenant-panel`, `tsc` + `medusa lint` в `apps/backend` — rc=0.
- Пары скриншотов admin/panel на каждый новый экран в `artifacts/docs/tenant-panel-shots/` (в git не идут).
- Витрина: контент-страницы и главная Acme отличаются от Globex после правки из панели (после revalidate), Initech не изменился.
- Утром Иван смотрит своими глазами: заголовки не обрезаны, статусы словами, форма заполняется без инструкции (18e).

## 6. Протокол ночи (как в волне 1)

- Ветка `feat/mt-panel-2` от `feat/mt-vendors` (worktree `~/upready/worktrees/upready-store/feat/mt-panel-2`), подветки на куски; коммиты `IVAN_OK=1`, литеральный pathspec, Conventional Commits `(t-2026-09-11-mt-panel-wave-2)`. **Push не делать.**
- Файлы связи: `artifacts/docs/2026-09-12-tenant-panel-night.md` (READY первой строкой по готовности), `…-defects.md`, `…-progress.md` (строка на каждый шаг с временем по `date`).
- Промпты воркерам — по-английски (3a), модель пинится на каждом agent() (5e). Воркеры не коммитят (21).
- Параллельно работает сессия B (платформа/онбординг/эксплуатация, `feat/mt-platform`). **Границы владения путей:** A владеет `apps/tenant-panel/**`, `apps/backend/src/api/tenants/**`, `apps/backend/src/api/store/tenant/**`, `apps/storefront/**`, `modules/tenant/models/tenant-page.ts` + `tenant-home-config.ts` и их миграции, `links/tenant-product-category.ts`, `links/tenant-promotion.ts`. B владеет `apps/backend/src/admin/**`, `apps/backend/src/api/admin/tenants/**`, `workflows/tenant/delete-tenant/**`, `api/tenants/uploads` (скоупинг файлов) и `docs/multitenancy/**`. Общий файл миграций модуля — согласовывать через `…-progress.md` обеих веток: B в эту ночь моделей в `modules/tenant` НЕ добавляет.
