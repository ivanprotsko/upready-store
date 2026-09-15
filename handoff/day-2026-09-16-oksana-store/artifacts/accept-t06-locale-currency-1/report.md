## Что изменилось

**Backend** (`apps/backend`)
- Новая модель `tenant_locale_settings` (миграция `Migration20260915042009`): `default_locale`, `enabled_locales` (JSON-массив), `default_country` — одна строка на тенанта, связь `tenant.locale_settings`.
- `GET`/`PUT /tenants/locale-settings` (`api/tenants/locale-settings/{route,validators}.ts`), zod-валидация на 36 кодов локалей + `enabled_locales` должен включать `default_locale`, не быть пустым и без повторов.
- Workflow `upsert-tenant-locale-settings` (шаг с компенсацией — тот же паттерн, что и `upsert-tenant-home`).
- `GET /storefront/by-host` отдаёт `locale: {default_locale, enabled_locales, default_country} | null` (коммит `d21af45` — уже был сделан параллельной сессией диспетчера на этой же задаче, см. «Инцидент» ниже).
- Скрипт бэкфилла `src/scripts/backfill-tenant-locale-settings.ts`: тенантам без своей записи ставит `ru`/`[ru,en]`, идемпотентен.

**Storefront** (`apps/storefront`)
- `src/middleware.ts`: если у тенанта есть `locale`, он побеждает над `defaultLocale`/`LOCALE_PIN`/`preferredLocales` — браузерное согласование ограничено `enabled_locales`, дефолт — `default_locale` тенанта; cookie-выбор языка учитывается только если он всё ещё входит в `enabled_locales` этого тенанта.
- `matchBrowserLocale()` (`i18n/config.ts`) получил `options.allowed`/`options.preferred`.
- `countryForLocale()` (`lib/geolocation/locale-country.ts`) и `resolveCountry()` (`lib/geolocation/index.ts`) получили необязательный `override`-map — `default_country` тенанта переопределяет `LOCALE_COUNTRY_MAP` образа только для его собственного `default_locale`.
- Переключатель языка (`nav/variants/h1..h6.tsx`) теперь получает список через новый `getSwitcherLocales()` (`lib/data/cookies.ts`), который читает заголовок `x-tenant-locales` и режет `appLocales` до `enabled_locales` тенанта; без тенанта — прежнее поведение (все 36).

**Tenant panel** (`apps/tenant-panel`)
- Экран «Язык и валюта» (`routes/settings/locale`): мультиселект `enabled_locales` (чипы), селект `default_locale` (только из выбранных языков — при снятии текущего дефолта переключается на первый оставшийся), `CountrySelect` для `default_country` (`allowClear`). Правило 19h: реальные контролы задизейблены до `loaded`, `touchedRef` не даёт фоновой загрузке затереть то, что владелец уже начал менять.
- `hooks/api/locale-settings.tsx`, `lib/locale-catalog.ts` (36 кодов+labels, транскрипция storefront-списка — общего пакета между apps нет).
- Ссылка со страницы `Overview` + маршрут `/settings/locale` в `app.tsx`.

## Как измерено

Все команды — на этой ветке, `apps/backend/.env` с `DB_NAME` на throwaway Postgres (`DB_HOST=localhost DB_USERNAME=postgres`), backend поднят на `:9219`, storefront — `npx next dev -p 8041`, панель — `vite --port 5180` (`VITE_MEDUSA_BACKEND_URL=http://localhost:9219`).

```
cd apps/backend && npx medusa lint && npx tsc --noEmit         # 0 errors, 6 pre-existing warnings (не мой код)
cd apps/backend && DB_HOST=localhost DB_USERNAME=postgres PORT=9219 pnpm test:unit
  # Test Suites: 1 failed, 5 passed — падение src/migration-scripts/__tests__/profile-data.unit.spec.ts
  # («productOptions» в i18n fr) — ПРЕДСУЩЕСТВУЮЩЕЕ, я не трогал migration-scripts/data/i18n.
cd apps/backend && DB_HOST=localhost DB_USERNAME=postgres PORT=9219 pnpm test:integration:http
  # Test Suites: 1 failed, 12 passed. Tests: 1 failed, 137 passed.
  # Падение — integration-tests/http/tenants-domains.spec.ts (ожидает домен без поля
  # is_primary) — ПРЕДСУЩЕСТВУЮЩЕЕ, эту ветку/файл я не трогал.
  # tenants-locale-settings.spec.ts (мой, 12 тестов) — все зелёные.

cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build   # чисто
cd apps/storefront && pnpm test                                             # 134/134 passed

cd apps/tenant-panel && pnpm typecheck && pnpm lint                         # чисто (23 pre-existing warnings)
```

Живая проверка (два тенанта на одном storefront-процессе, `demo1`/`demo2`, `/tenants/locale-settings` выставлены через API):

```
curl -s -I "http://demo1.localhost:8041/"
  HTTP/1.1 302 Found
  location: /ru
  set-cookie: _medusa_locale=ru; ...
  set-cookie: _medusa_country=ru; ...
  x-geo-source: locale; x-geo-provider: locale-map; x-geo-country: ru

curl -s -I "http://demo2.localhost:8041/"
  HTTP/1.1 302 Found
  location: /en
  set-cookie: _medusa_locale=en; ...
  set-cookie: _medusa_country=us; ...

curl -s -I -H "Accept-Language: de" "http://demo1.localhost:8041/"
  HTTP/1.1 302 Found
  location: /ru        # не /de — Германия не входит в enabled_locales demo1 (ru,en)

curl -s -I -H "Accept-Language: de" "http://demo2.localhost:8041/"
  HTTP/1.1 302 Found
  location: /en         # у demo2 единственный enabled_locales = [en]
```

Скриншоты (`artifacts/docs/t06-locale-currency/`, вне git):
- `demo1-ru-home.png` — витрина demo1 на `/ru`, шапка «RU ⌵» + «🇷🇺 ₽ ⌵».
- `demo2-en-home.png` — витрина demo2 на `/en`, шапка «EN ⌵» + «🇺🇸 $ ⌵».
- `demo1-switcher-open.png` — открытый диалог «Смена региона»: колонка «Язык» содержит РОВНО «English»/«Русский», без остальных 34.
- `panel-locale-settings-loaded.png` / `-edited.png` / `-saved.png` — экран панели «Язык и валюта»: загрузка сохранённых значений, добавление «Deutsch (de)» в мультиселект, успешное сохранение (тост «Language and currency were saved.»).

Бэкфилл (`docker exec … medusa exec ./src/scripts/backfill-tenant-locale-settings.js [dry-run]`, локально — те же два тенанта, свежая throwaway БД):

```
=== RUN 1: dry-run ===
backfill-tenant-locale-settings: [dry-run] would set tenant ten_...GTX8... (demo1) to default_locale=ru, enabled_locales=ru,en
backfill-tenant-locale-settings: [dry-run] would set tenant ten_...GTX9... (demo2) to default_locale=ru, enabled_locales=ru,en
backfill-tenant-locale-settings: 2 tenants, 2 would be patched, 0 left alone.
# после dry-run — count(*) from tenant_locale_settings = 0 (ничего не записано)

=== RUN 2: real (первый) ===
backfill-tenant-locale-settings: tenant ...demo1... — set to ru/en default
backfill-tenant-locale-settings: tenant ...demo2... — set to ru/en default
backfill-tenant-locale-settings: 2 tenants, 2 patched, 0 left alone.

=== RUN 3: real (повтор) ===
backfill-tenant-locale-settings: 2 tenants, 0 patched, 2 left alone (already have their own locale settings).
```

## Найденный и исправленный баг

Первая версия скрипта проверяла `args.includes("--dry-run")`. Замер на этой машине (`medusa exec ./script.ts -- --dry-run`, `medusa exec ./script.ts --dry-run`) показал: `medusa exec` либо ругается «Unknown arguments: dry-run, dryRun» (без `--`-разделителя — CLI считает флаг своим), либо тихо съедает `--dry-run` и передаёт в `args` пустой массив (с `--`-разделителем). Только БЕЗ дефиса (`medusa exec ./script.ts dry-run`) флаг реально долетает до `args`. Скрипт и комментарий в нём поправлены на бездефисную форму (с обратной совместимостью на `--dry-run`, если кто-то всё же так вызовет через обёртку, которая сама распарсит флаги).

## Инцидент: дублирующийся воркер

В процессе работы обнаружилось, что диспетчер параллельно запустил ВТОРУЮ сессию (`day16-locale-currency-7a`) в тот же самый worktree на эту же задачу — оба процесса писали в одни файлы (`lsof` показал два процесса с открытыми файлами в одном каталоге). Скоординировались через `SendMessage`: пир доделал компилируемость бэкенд-слоя (relation в `tenant.ts`, регистрация в `service.ts`, middleware-валидатор, поле `locale` в `by-host`) и типы в `resolve.ts`/`headers.ts` на storefront (коммит `d21af45`, уже в истории ветки), затем остановился и передал mid­dleware/geolocation/switcher/панель/бэкфилл — что и было доделано в трёх следующих коммитах. Конфликтов в истории нет, дублей кода нет — проверено `git log`/`git diff` по каждому файлу перед коммитом.

## Что НЕ сделано и почему

- Не трогал 36 каталогов переводов и `messages/` — задача явно это запрещает, а новых UI-строк в сторону 36-локального парного катал я не добавлял (переключатель работает на уже существующих `localeLabels`).
- Валюта — это ровно текущая цена на варианте в регионе `default_country`; конвертации курса нет (как и требовалось).
- `_medusa_locale` по-прежнему не участвует в решении редиректа — не трогал эту часть.
- Бэкфилл НЕ запускался на живой БД (это дело deploy-задачи, инструкция явно запрещает).
- Предсуществующие падения (`tenants-domains.spec.ts`, `profile-data.unit.spec.ts` i18n fr) — не мои файлы, не чинил, задокументировал выше как есть (правило 18h).

## Как проверить за 10 минут

```
cd apps/backend && DB_HOST=localhost DB_USERNAME=postgres PORT=<свободный> pnpm test:integration:http -- tenants-locale-settings
cd apps/storefront && pnpm test
cd apps/tenant-panel && pnpm typecheck
```
Живьём: поднять backend+storefront, создать два тенанта, `PUT /tenants/locale-settings` с разными `default_locale`/`enabled_locales`/`default_country`, curl -I на оба хоста — редиректы и `Set-Cookie` должны разойтись, как в примерах выше.
