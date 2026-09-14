# Витрина тенанта: head, подвал, опции, язык — ветка `fix/mt-storefront-head-footer` (2026-09-12)

Заказ Ивана: четыре дефекта живых магазинов из «Волна 2 → Найдено сверх приёмки»
(`artifacts/docs/2026-09-12-mt-deploy-acceptance/README.md` на `dev`), правило 20 — класс, а не
один вызов, все пять хостов. Ветка от `feat/mt-deploy` (df921b0). **Код не задеплоен** — деплой
только по команде (21c). Проба здесь: `probe-local.mjs`, кадры — `shots/` (в git не входят).

## Как проверялось до деплоя

Локальная standalone-сборка витрины (`next build`, `NEXT_PUBLIC_BASE_URL=https://stores.shipshift.dev`
как на проде) на `127.0.0.1:8040`; Playwright через `context.route` отдаёт HTML для
`https://<host>.shipshift.dev/…` из локальной сборки с заголовками `Host`/`X-Forwarded-Proto: https`,
данные — с прод-бэкенда (`GET /storefront/by-host` и Store API, только чтение). Браузер `ru-RU`,
1280×900. Ошибки `ERR_SSL_PROTOCOL_ERROR` / «Failed to fetch RSC payload» в консоли — артефакт
перехвата prefetch, не продукта. Проверки кода: витрина `tsc` 0, `next lint` 0, `vitest` 91/91
(8 файлов); бэкенд `tsc` 0, `medusa lint` 0 ошибок (3 старых предупреждения).

`SHOTS=<dir> LOCAL=http://127.0.0.1:8040 node probe-local.mjs <acme|globex|initech|nochlavka|testovyy-magazin>`
(из каталога с симлинком `node_modules -> /opt/homebrew/lib/node_modules`).

## Что найдено в коде (причины)

| Дефект | Причина | Правка (коммит) |
|---|---|---|
| canonical/hreflang на `stores.shipshift.dev` | `NEXT_PUBLIC_BASE_URL` один на образ (`docker exec mt-storefront env`), константа уровня модуля в alternates/json-ld/sitemap/robots/llms.txt/metadataBase | middleware ставит `x-tenant-origin`; `getRequestBaseURL()`; всё читает базу per request (2be7e2a) |
| чужие коллекции и ссылки стартера в подвале нового магазина | коллекции в Medusa глобальны, `/store/collections` отдаёт все; F1 с зашитыми ссылками Gorgo/Medusa; `PoweredBy` везде | `listCollections()` оставляет только коллекции с товарами этого ключа; ссылки стартера, `PoweredBy` и заголовок «Информация» без страниц — только без тенанта (41a9eab) |
| «Colourway · Colour · Default option · Default option value» | (а) список `/store/products` переводит вложенные опции ТОЛЬКО при `*options` (замер: `options.title` → «Size», `*options` → «Размер» при одном `x-medusa-locale: ru`); (б) «Default option» — служебная опция Medusa для товара без опций, показывалась в фильтрах и на карточке; (в) сид не читал блок `productOptions` профилей → в БД прода ru «Colourway» = «Colourway» | (а) wildcard-поля; (б) `lib/util/option-filter-groups.ts` + карточка; (в) сид читает блок, для прода `scripts/backfill-option-translations.ts` (9fdcf27) |
| английский подзаголовок героя и подвал на /ru, флаг у «RU» | документ главной одноязычный; F3/F5/F6, hero-h/m, h3 и `ProfileHero` читали промо/тэглайн/фото профиля сборки; `RegionSelect` — одна кнопка флаг+язык | `shop-copy.ts` (null на тенанте), `ProfileHero` без fallback на профиль у тенанта, `content.hero.i18n[locale]` (валидатор, тип, витрина, сид, мастер, `backfill-hero-copy.ts`), две кнопки «RU ▾» и «🇺🇸 USD ▾» (03bb5bf) |

## Замер на локальной сборке против прод-данных

| Что | acme | globex | initech | nochlavka | testovyy-magazin |
|---|---|---|---|---|---|
| canonical `/ru` | свой хост | свой хост | свой хост | свой хост | свой хост |
| hreflang | 37 на своём хосте | 37 | 37 | 37 | 37 |
| robots/sitemap | свой хост (globex проверен curl) | — | — | — | — |
| внешние ссылки в подвале | 0 | 0 | 0 | 0 | 0 |
| коллекции в подвале | Новинки, Хиты продаж | Утренний стол, Сделано, чтобы пользоваться | Новинки, Хиты продаж | 0 | 0 |
| «Default option» на `/ru/store` | нет | нет | нет | нет | нет |
| фильтры `/ru/store` | Размер · Colourway · Colour | — | — | — | — |
| шапка | h5, региона нет | h5 | h5 | «RU ▾» + «🇺🇸 USD ▾» | «RU ▾» + «🇺🇸 USD ▾» |
| промо-строка профиля в подвале | нет | нет | нет | нет | нет |
| подзаголовок героя `/ru` | английский (документ прода без `i18n`) | английский | английский | русский | русский |
| сломанная картинка в герое | — | — | — | нет (была) | нет |

Глазами (`shots/nochlavka-local-home.png`, `shots/acme-local-store.png`): шапка нового магазина —
«RU ▾» и «🇺🇸 USD ▾» раздельно; герой без сломанного значка картинки; подвал — только имя и
копирайт; на `/ru/store` acme фильтры «Размер · Colourway · Colour», карточки с размерами и
кружками цвета, «Default option value» под ценой исчез.

## Что осталось английским и почему

- «Colourway»/«Colour» в фильтрах acme на `/ru`: строка в БД прода такая (сид скопировал
  английское название вместо «Расцветка»/«Цвет»). Чинится бэкфиллом после деплоя, не витриной.
- Подзаголовок героя acme/globex/initech на `/ru`: документы главной на проде записаны до поля
  `i18n`. Прогон `seed-mt-demo.js` даёт им ru-копию (проверено кодом сида: «existing home
  document given its localized hero copy»).
- Значения опций («Concrete», «Tar black») переводятся тем же бэкфиллом (у профилей есть
  `values` в `productOptions`).

## После деплоя — обязательный порядок

1. Пересобрать и поднять `mt-backend` и `mt-storefront` (старый образ бэкенда молча ничего не сделает).
2. `docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/seed-mt-demo.js`
3. `docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-hero-copy.js`
4. Для каждого профиля: `docker exec -e STORE_PROFILE=sneakers mt-backend node_modules/.bin/medusa exec ./src/scripts/backfill-option-translations.js` (и `home-goods`, `electronics`).
5. Приёмка глазами на проде: `SHOTS=<dir> node storefront.mjs <host>` из `artifacts/docs/2026-09-12-mt-deploy-acceptance/` (ветка `dev`) по пяти хостам плюс `curl -s https://acme.shipshift.dev/ru | grep canonical`.

## Не в объёме, названо

- Страница `/collections/<handle>` чужой коллекции на тенанте по-прежнему открывается пустой (ссылок на неё больше нет).
- Стенды (одиночные магазины) ссылки стартера в подвале сохраняют — вопрос `q-stands-footer-starter-links` остаётся Ивану.
- Панель тенанта редактирует базовые поля героя; сохранение из панели документа с `i18n` не проверялось (зод-схема поле принимает).
