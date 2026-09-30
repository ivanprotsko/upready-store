# t-2026-09-12-seeded-hosts-no-locale-controls — контролы языка и валюты на посеянных витринах: доказательства

Замеры сняты 30.09 примерно с 13:20 до 13:35 WITA на мультитенантном стенде. Одна витрина на все хосты, магазин выбирается по `Host`.
- **Бэкенд:** порт 9611, `medusa develop`, БД `upready_store_ex_11`. БД восстановлена из `upready_store_live_copy` скриптом `apps/backend/scripts/stand-use-live-copy.mjs`: `pg_dump -Fc | pg_restore --no-owner`, затем `db:migrate`.
- **Витрина:** порт 8611, только `next build && next start`, с переменными МТ-деплоя из `deploy/compose.mt.yml`: `NEXT_PUBLIC_DEFAULT_LOCALE=ru`, `LOCALE_PIN=true`, `REGION_PIN=true`, `LOCALE_COUNTRY_MAP=ru:ru,en:us`.
- **Хосты:** `acme`, `globex`, `initech` — посеянные витрины. `nochlavka` и `testovyy-magazin` — обычные тенанты. Все открываются как [http://<handle>.localhost:8611/ru](http://<handle>.localhost:8611/ru).

После замера стенд погашен.

## Причина

В копии live у всех трёх посеянных витрин шапка h5 (`tenant_home_config.config.settings.header`). У `nochlavka` и `testovyy-magazin` шапка h1. Своих настроек языков нет ни у одного из пяти магазинов (`tenant_locale_settings` пусто), регионы общие (241), среди них Russia/RUB. Данные сида ни при чём: посеянные витрины отличаются от обычных только вариантом шапки.

1. Причина, найденная 12.09, — h5 вовсе не импортировал `RegionSelect`. Её закрыл 21.09 коммит [93e39f7e](https://github.com/ivanprotsko/upready-store/commit/93e39f7ee464e0819166596ff344e38cd2789308) в #105 («country and language control in the h5 header»). Но h5 показывал контрол только от 1024 px (`hidden lg:flex`). На телефоне язык и валюта были только в меню нижней панели.
2. Шапка h1 обычного тенанта держит контрол в полосе на любой ширине. Поэтому на 390 посеянная витрина всё ещё отличалась от обычной: в шапке h5 оставались название и корзина.

## Приёмка

| Пункт | Доказательство |
|---|---|
| На посеянных хостах те же контролы языка и валюты, что у обычного тенанта | `measure-before.json` и `measure-after.json`. **До:** на 1440 у acme, globex, initech видны `nav-region-select-button` («RU») и `nav-country-select-button` (флаг + «₽»); на 390 видимых — 0, только в меню. У nochlavka и testovyy-magazin на 390 оба контрола в шапке. **После:** на 390 у acme, globex, initech оба контрола в шапке, и в меню они тоже есть, как у h1. Обычные тенанты не изменились |
| Переключение на RUB/ru работает | acme открыт на `/en` (цены $128.99, $158.99, $118.99). В диалоге контрола валюты выбраны Россия и русский, «Применить» → `/ru`, контролы «RU» и «₽», цены 11 170,99 ₽, 13 768,99 ₽, 10 304,99 ₽. Проверено на 1440 (`measure-after.json`, `switched`) и на 390 контролом из шапки телефона (`measure-after-phone.json`) |
| Причина названа | Выше: вариант шапки h5, на телефоне — `hidden lg:flex` |
| Скриншоты 1440 и 390 до и после | `shots/before-<хост>-{1440,390}.webp`, `shots/after-<хост>-{1440,390}.webp`. На 390 ещё `-menu` (меню нижней панели открыто). Переключение: `shots/*-acme-{1440,390}-switch-dialog.webp` и `*-switched.webp` |
| Длинное название не выталкивает контролы | Только на копии стенда у `accept-products-1106` («Ночная приёмка товаров», 22 знака) шапка на время замера переключена на h5, потом возвращена на h1. На 390: название обрезано многоточием, «RU», «₽» и корзина на месте (`shots/after-accept-products-1106-390.webp`) |

## Проверки

- `next build` — exit 0: до правки и после.
- `npm run lint` (витрина) — exit 0. `next lint`: 2 прежних предупреждения `no-img-element`, оба в файлах вне этой правки. `check-ui-content-allowlist` ok, `check-var-colour-opacity` ok.
- `npm test` (vitest): 66 файлов, 576 тестов зелёные.
- `e2e/phone-controls.e2e.mjs` на `acme` (h5) и `nochlavka` (h1): `PASSED: 0 failure(s)`, 5 из 5 проверок.

## Повтор

Поднять стенд как выше, затем
`PLAYWRIGHT_PATH=<node_modules/.pnpm/playwright@1.63.0/node_modules/playwright> PORT=8611 TAG=<метка> SWITCH=acme node docs/evidence/t-2026-09-12-seeded-hosts-no-locale-controls/measure-header.mjs`.
Хосты задают `HOSTS`, ширины — `WIDTHS`, ширину переключения — `SWITCH_WIDTH`. Скрипт пишет PNG. В репозиторий снимки легли в WebP (`cwebp -q 90`): 41 файл, 7,1 МБ → 1,2 МБ; ссылки в `measure-*.json` переписаны на `.webp`.
