# Отчёт b13-locale-single-source

2026-09-16 00:03 WITA. Ветка `fix/day16-locale-single-source`, база `dev`.

Источники: `logs/accept-t06-locale-currency-2.findings.md` («Ниты» 1–3),
`logs/accept-f06-shipping-method-names-1.findings.md` («Мелочи» 2).

## 1. Один источник каталога локалей → тест-сверка

Выбор: **тест-сверка**, не общий `@upready/*` пакет — `pnpm-workspace.yaml` перечисляет только `apps/**`,
и три приложения (storefront/backend/panel) сборочно независимы (упрощённый клон для владельца магазина);
пакет тянет сборочную обвязку во всех трёх. Файлы каталога остаются как есть (комментарии в них уже
объясняют почему копия рукописная), но теперь есть скрипт, который красит CI, если они разойдутся.

- `scripts/check-locale-catalogs.mjs` — сверяет `locales` (`apps/storefront/src/i18n/config.ts`) против
  `LOCALE_CODES` в `apps/backend/src/api/tenants/locale-settings/validators.ts` и
  `apps/tenant-panel/src/lib/locale-catalog.ts`.
- `pnpm check:locale-catalogs` в корневом `package.json`.
- `AGENTS.md` → раздел Localization, новый абзац с командой.

Оба прогона (убрал `"bg"` из панели и вернул обратно):

```
$ node scripts/check-locale-catalogs.mjs
check-locale-catalogs: DRIFT against storefront (apps/storefront/src/i18n/config.ts) (36 codes):
  tenant-panel (apps/tenant-panel/src/lib/locale-catalog.ts):
    missing: bg
rc=1

$ node scripts/check-locale-catalogs.mjs
check-locale-catalogs: OK — 3 catalogs, 36 codes each, all agree.
rc=0
```

## 2. Имена способов доставки по умолчанию → язык тенанта, не сборки

`provisionTenantWarehouseWorkflow` (шаг 5 `create-tenant/index.ts`) по-прежнему пишет имена в
`STOREFRONT_DEFAULT_LOCALE` в момент провижининга — в этот момент тенанта ещё не существует
(`createTenantStep` идёт ПОСЛЕ), так что у него физически нет своего `default_locale`. Это
неизбежно и явно написано в комментарии кода.

Фикс — на другом конце: `PUT /tenants/locale-settings` (t06) теперь релокализует ещё-не-переименованные
способы доставки тенанта на сохранённый `default_locale`, тем самым заменяя зависимость от
`STOREFRONT_DEFAULT_LOCALE` собственным языком магазина, как только владелец его выбирает:

- `apps/backend/src/shipping-tariffs/default-method-names.ts` — новая `matchesKnownDefaultName(name)`:
  узнаёт имя способа, которое ещё совпадает с одной из копий (`Самовывоз`/`Курьером`/`Pickup`/`Courier`),
  то есть владелец его не переименовывал.
- `apps/backend/src/shipping-tariffs/relocalize-default-methods.ts` — новая функция
  `relocalizeDefaultShippingMethods(container, serviceZoneIds, locale)`: переименовывает name/description/
  delivery_hint/type у ещё-дефолтных опций; тариф и цену не трогает; опцию без tenant-`data` (до тарифов)
  пропускает.
- `apps/backend/src/api/tenants/locale-settings/relocalize-shipping-methods.ts` — request-обёртка:
  берёт `service_zone_ids` тенанта через `getTenantWarehouse(req)`, молча ничего не делает, если warehouse
  ещё не провижинился.
- `apps/backend/src/api/tenants/locale-settings/route.ts` — вызывает релокализацию сразу после
  `upsertTenantLocaleSettingsWorkflow`, логирует число переименованных опций.
- Юнит-тест на `matchesKnownDefaultName` в `default-method-names.unit.spec.ts`.
- Фикстура для повторного замера: `apps/backend/scripts/fixtures/b13-locale-shipping-names.ts`
  (`npx medusa exec ./scripts/fixtures/b13-locale-shipping-names.ts`).

### Критерий готовности — два тенанта, разный `default_locale`

Локальный стенд: БД `upready_store_b13` на `127.0.0.1:5433`, бэкенд `medusa develop` на `:9033`,
`STOREFRONT_DEFAULT_LOCALE=ru` (как на бою — «все магазины ru»).

Фикстура создала `b13shopru` (не трогал локаль — остался на дефолте сборки `ru`) и `b13shopen`
(сохранил `default_locale=en` через `upsertTenantLocaleSettingsWorkflow`, что и делает `PUT`):

```
b13-seed: [ru, untouched] B13 Shop RU shipping options: Самовывоз (Заберите заказ у продавца.) | Курьером (До двери. Стоимость подтвердит магазин.)
b13-seed: [en tenant, BEFORE locale save] B13 Shop EN shipping options: Курьером (…) | Самовывоз (…)
b13-seed: relocalized 2 option(s) of b13shopen to en
b13-seed: [ru, still untouched] B13 Shop RU shipping options: Самовывоз (…) | Курьером (…)
b13-seed: [en tenant, AFTER locale save] B13 Shop EN shipping options: Courier (To your door. The shop confirms the cost.) | Pickup (Collect the order from the seller.)
```

Полный лог: `artifacts/docs/b13-locale-single-source/fixture-run.log`.

Живой замер через API (как в приёмке f06) — реальные корзины, `GET /store/shipping-options?cart_id=…`
с publishable-ключом каждого тенанта:

```
=== b13shopru (ru) ===
Самовывоз | {"label":"Самовывоз","description":"Заберите заказ у продавца.","code":"pickup"}
Курьером | {"label":"Курьером","description":"До двери. Стоимость подтвердит магазин.","code":"courier"}

=== b13shopen (en) ===
Courier | {"label":"Courier","description":"To your door. The shop confirms the cost.","code":"courier"}
Pickup | {"label":"Pickup","description":"Collect the order from the seller.","code":"pickup"}
```

Полные JSON: `artifacts/docs/b13-locale-single-source/shipping-options-b13shopru.json`,
`artifacts/docs/b13-locale-single-source/shipping-options-b13shopen.json`.

**Ограничение, не входит в эту пачку**: у совсем НОВОГО тенанта в момент регистрации (до первого
сохранения `/settings/locale`) имена по-прежнему на `STOREFRONT_DEFAULT_LOCALE` — своей локали у него
физически ещё нет. Реальный онбординг всегда проходит через экран «Язык и валюта», так что разрыв
закрывается первым же сохранением; если нужно решить и створку регистрации (передавать locale уже в
`POST /tenants`), это отдельная задача — сбор `x-medusa-locale`/явного поля в форме регистрации.

## 3. Скелетон → задизейбленный реальный контрол

`apps/tenant-panel/src/routes/settings/locale/locale.tsx`: убран ранний
`if (isPending) return <SingleColumnPageSkeleton sections={1} />` перед рендером. Экран всегда рисует
реальную форму; `disabled={!loaded}` (уже было) держит контролы недоступными, пока `GET
/tenants/locale-settings` не ответил.

Скриншот 1280×900 в разгаре обращения (задержка внесена клиентски через Playwright `page.route`,
GET `/tenants/locale-settings` задержан на 4000 мс, снято на +2616 мс):

`artifacts/docs/b13-locale-single-source/locale-settings-loading-1280x900.png`

```
b13-shot: delaying GET /tenants/locale-settings by 4000ms
b13-shot: screenshot at +2616ms → …/locale-settings-loading-1280x900.png
b13-shot: .animate-pulse count on screen = 0 (0 = no skeleton, real control shown)
b13-shot: default-locale control disabled = true
```

Лог: `artifacts/docs/b13-locale-single-source/skeleton-shot.log`. На скриншоте видна настоящая форма
(«Языки магазина», «Язык по умолчанию», «Валюта по умолчанию», кнопка «Сохранить») в сером
(задизейбленном) виде — не скелетон-заглушка.

## 4. Строка про `dry-run` без дефиса

`apps/backend/README.md`, после абзаца про `medusa lint`/`--lint false`:

> One-off backfills and imports under `src/scripts` that take a `dry-run` switch
> (`backfill-tenant-locale-settings.ts`, `backfill-product-attributes.ts`, `import-cherkashino-redirects.ts`,
> `import-cherkashina-reviews.ts`, `prefill-cherkashino-requisites.ts`) run through `medusa exec` and spell
> it as a bare, dash-less word rather than `--dry-run`: `medusa exec ./src/scripts/<name>.ts dry-run`.
> `medusa exec` hands a script its own positionals verbatim but swallows a leading `--` before it ever
> reaches them (measured on the Medusa CLI 2.19), so the dashed spelling silently runs the script for
> real instead of previewing it. Every one of those scripts still accepts `--dry-run` too, in case you
> type it out of habit, but `dry-run` is the form that is guaranteed to work.

## Проверки

- `node scripts/check-locale-catalogs.mjs` → OK (красный/зелёный прогон выше).
- `cd apps/backend && npx tsc --noEmit` → rc=0.
- `cd apps/backend && npx medusa lint` → rc=0, 62 warning (все существовавшие до этой пачки, в
  затронутых файлах предупреждений нет).
- `pnpm check:backend-build` (тот же шаг, что образ) → rc=0, backend+frontend build completed.
- `pnpm check:backend-fixtures` → rc=0 (типы фикстуры валидны).
- `cd apps/backend && TEST_TYPE=unit … jest shipping-tariffs` → 4 suite, 36 tests passed (включая новый
  тест `matchesKnownDefaultName`).
- `cd apps/tenant-panel && npx tsc --noEmit` → rc=0.
- `cd apps/tenant-panel && npx eslint src/routes/settings/locale/locale.tsx` → rc=0.
- Интеграционные (`test:integration:http`) и e2e панели не гонял — не завязаны на изменённые файлы,
  а поднятие живого стенда уже дало то же покрытие вручную (разделы 2–3 выше).

## Не сделано / ограничения

- Локаль НОВОГО тенанта в момент `POST /tenants` (до первого сохранения `/settings/locale`) всё ещё
  берётся из `STOREFRONT_DEFAULT_LOCALE` — см. пояснение в разделе 2. Реальный онбординг закрывает разрыв
  первым же сохранением экрана «Язык и валюта».
- Каталог локалей остаётся тремя файлами (по выбору — тест-сверка, не пакет); полноценный
  `@upready/*`-пакет — отдельная задача reuse-library, если понадобится общий рантайм-код между apps.

## Как проверить за 10 минут

```bash
cd apps/backend && npx tsc --noEmit && npx medusa lint
cd apps/tenant-panel && npx tsc --noEmit && npx eslint src/routes/settings/locale/locale.tsx
node scripts/check-locale-catalogs.mjs
```

Живой прогон (нужен свободный порт и Postgres на 127.0.0.1:5433):

```bash
cd apps/backend
cp .env.template .env   # DB_NAME=<scratch>, DATABASE_URL на свой Postgres, STOREFRONT_DEFAULT_LOCALE=ru
npx medusa db:migrate
npx medusa exec ./scripts/fixtures/b13-locale-shipping-names.ts
```
