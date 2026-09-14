# Приёмка PR #26 · t06-locale-currency · раунд 2 — MERGED

Отчёт составлен 2026-09-15 05:43 WITA. Приёмщик: headless-сессия в главном чекауте (ветка dev, кода здесь не коммитил).
PR: https://github.com/ivanprotsko/upready-store/pull/26 · ветка `feat/day16-locale-currency` → `dev`.
Итог: **MERGED** — `gh pr merge 26 --squash`, merge-коммит `3e5519bb042ca60658f1e9fe5ae31efa7b7852bf`, `mergedAt=2026-09-14T21:42:15Z` (леджер — GitHub).

## Гонка с воркером в начале раунда (не находка)

Раунд 2 приёмки был запущен, пока воркер ещё делал ребейз, которого потребовал раунд 1:
на 05:13 `origin/feat/day16-locale-currency` стоял на `efebc40` (как в раунде 1), PR — `CONFLICTING`/`DIRTY`,
а в worktree лежал незавершённый мерж (`MERGE_HEAD` = `b2453fb` = `origin/dev`, mtime 05:11).
Приёмщик дождался пуша (`65790ba`, 05:15:21) и мерил уже его.

Склейка конфликтов проверена поимённо — обе стороны сохранены во всех четырёх компиляционных местах:
`tenant.ts` (`TenantIntegrationSecret` + `TenantLocaleSettings`), `service.ts` (обе модели в `MedusaService`),
`app.tsx` (`/settings/locale` и `/settings/payments` — два отдельных маршрута), `home.tsx` (обе ссылки).

## Стенд (поднят приёмщиком с нуля)

- БД `upready_store_t06acc` на localhost:5433, `npx medusa db:migrate` + `pnpm seed` + `seed-tenants.ts` — rc=0.
  Настоящий потребитель адреса БД — `DATABASE_URL` (`apps/backend/medusa-config.ts:97`); `DB_PORT` бэкендом не читается
  (тестовый харнесс, наоборот, читает `DB_*`) — первый прогон на этом и упал, форма исправлена.
- backend `medusa develop` на :9261 (`medusa start` требует прод-сборки), витрина `next dev -p 8161`
  с **build-дефолтом `STOREFRONT_DEFAULT_LOCALE=en`** — это и делает замер дефолта тенанта дисположительным,
  панель `vite --port 5281`.
- Два тенанта в ОДНОМ процессе витрины: `acme` (default `ru`, enabled `[ru,en]`, country `ru`),
  `globex` (default `en`, enabled `[en]`, country `us`) — выставлены через `PUT /tenants/locale-settings`.

## Критерии приёмки — измерено

| Критерий | Замер | Итог |
|---|---|---|
| Два тенанта с разными дефолтами из одного процесса витрины | `curl -I acme.localhost:8161/` → **302 → /ru**, `_medusa_country=ru`, `x-geo-source: locale`; `globex.localhost:8161/` → **302 → /en**, `_medusa_country=us` | ✅ |
| Дефолт тенанта побеждает build-дефолт | build-дефолт стенда `en`, acme всё равно открывается на `/ru` | ✅ |
| `Accept-Language: de` на русском магазине → `/ru` | `302 → /ru` (de не входит в enabled `[ru,en]`) | ✅ |
| Браузерный язык из enabled уважается | `Accept-Language: en` на acme → `302 → /en` | ✅ |
| Язык вне enabled у второго магазина | `Accept-Language: ru` на globex (`[en]`) → `302 → /en` | ✅ |
| Переключатель показывает только включённые языки | В диалоге «Смена региона» колонка «Язык» = ровно `[en, ru]` у acme и ровно `[en]` у globex (селектор `id^="region-language-"`; глазами по скриншотам `acme-switcher-open.png`, `globex-switcher-open.png`) | ✅ |
| Валюта магазина | триггер переключателя acme — «RU» + **«₽»**, globex — «EN» + **«$»**; регион выбран из `default_country` тенанта (`x-geo-provider: locale-map`) | ✅ (см. «Что НЕ удалось измерить») |
| Cookie-выбор посетителя побеждает дефолт | `_medusa_locale_choice=en` на acme → `302 → /en` | ✅ |
| Cookie вне enabled игнорируется | `_medusa_locale_choice=de` на acme → `/ru`; `=ru` на globex → `/en` | ✅ |
| `_medusa_locale` не решает редирект | `-b "_medusa_locale=de"` на acme → `/ru` | ✅ |
| Fallback на env без тенанта | `curl -I localhost:8161/` → `302 → /en` (build-дефолт), `by-host` до сохранения настроек отдавал `locale: null` | ✅ |
| Storefront unit + `i18n/config.test.ts` | `pnpm test` → **Test Files 13 passed (13), Tests 134 passed (134)** | ✅ |
| Бэкфилл дважды ничего не меняет | dry-run: «1 would be patched», строк в таблице после него **1** (не записал); real: «1 patched»; повтор: «**0 patched, 2 left alone**»; строка acme не тронута (`updated_at` тот же, `default_country=ru` сохранён) | ✅ |
| Экран панели «Язык и валюта» | `/settings/locale` под `admin@acme.test` открывается, подхватывает сохранённое (чипы «Русский (ru)», «English (en)», дефолт «Русский (ru)», «Russian Federation»), селект дефолта предлагает ровно два включённых языка; скриншоты `panel-02-locale-loaded.png`, `panel-03-default-locale-open.png` | ✅ |

## Проверки

| Проверка | Команда | Результат |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` | rc=0 |
| Panel typecheck | `pnpm typecheck` | rc=0 |
| Storefront typecheck | `npx tsc --noEmit` | rc=0 |
| Storefront unit | `pnpm test` | 13 файлов / 134 теста passed |
| Seam `tenants-locale-settings` | `pnpm test:integration:http -- tenants-locale-settings` | **Test Suites: 1 passed, Tests: 12 passed, 12 total** |
| Полный seam-сьют | `pnpm test:integration:http` | **Test Suites: 2 failed, 13 passed, 15 total; Tests: 3 failed, 153 passed, 156 total** — разбор ниже |
| Backend unit | `pnpm test:unit` | Test Suites: 1 failed, 7 passed; Tests: 1 failed, 79 passed — падение `src/migration-scripts/__tests__/profile-data.unit.spec.ts`, предсуществующее (файл в дифе PR отсутствует) |

### Разбор трёх падений полного seam-сьюта (не этот PR — атрибутировано замером)

Первый прогон дал 11 падений; 8 из них (`tenants-payment-settings.spec.ts`) оказались дыркой МОЕГО стенда:
`POST /tenants/seed` отдавал 500 с текстом «Neither STORE_PROFILES_MEDIA_BASE_URL nor STORE_MEDIA_BASE_URL is set».
С этими переменными сьют **8/8 passed** — то есть это было окружение приёмщика, а не код.

Остались три:
1. `tenants-domains.spec.ts › resolves a custom host as soon as the tenant adds it` — лишнее поле `is_primary`.
   Предсуществующее, задокументировано ещё приёмкой t05 (пришло из x02-domains).
2–3. `tenants.spec.ts › resolves shipping options only from the tenant's own warehouse` и
   `keeps two tenants' warehouses apart even in the same city`.

Почему это не PR #26:
- оба спек-файла **байт-в-байт идентичны `origin/dev`** (`git diff origin/dev...origin/feat/day16-locale-currency` по ним пуст);
- в дифе PR **ноль** файлов со словами shipping/warehouse/fulfil/region/stock (проверено `--name-only | grep -ic`);
- последнее изменение кода доставки/складов в `dev` — коммит `b2453fb` (PR #25, t04-shipping-tariffs), то есть сам HEAD `origin/dev`,
  а спек с тех пор не менялся.

**Отдельная задача для диспетчера: `dev` сейчас красный на этих трёх тестах** (2 из них приехали с PR #25).

## Разбор диффа — стоп-факторов нет

- Миграция `Migration20260915042009` аддитивная: `create table if not exists "tenant_locale_settings"`,
  два партиальных индекса, FK на `tenant`; `down()` дропает только свою таблицу. Существующих таблиц не касается,
  бэкап не нужен. На живой БД не запускалась (это дело deploy-задачи).
- Секретов в коде нет, файлов не удалено, protected-infra не затронута, деплоя нет.
- Env `STOREFRONT_DEFAULT_LOCALE`/`LOCALE_PIN`/`LOCALE_COUNTRY_MAP` сохранены как fallback (`locale: null` → прежняя ветка) — измерено на `localhost:8161`.
- Конвертации курсов нет: `default_country` выбирает регион, цены берутся заведённые.
- Каталог 36 локалей не урезан, `messages/` не тронут (36 меток в HTML — это словарь `LanguageSelect.locales` из messages, а не отрисованный переключатель; проверено контекстом).
- Правило 20 проверено: `getSwitcherLocales()` подключён в `h1,h2,h3,h4,h6`; `h5` переключателя не имеет по построению
  («Region and account are absent from this variant»), других потребителей `appLocales` вне `i18n/config` нет.
- Панель следует 19h: `touchedRef` + третье состояние `loaded` + `disabled={!loaded}` на всех трёх контролах.

## Что НЕ удалось измерить (названо честно, не выдано за проверенное)

- **Ценники в ₽ против $ на самой странице.** Каталог сид-тенантов пуст (`GET /store/products` под ключом acme → `products: 0`:
  сид кладёт товары в дефолтный канал, у сид-тенантов свои каналы), поэтому цен на витрине нет вовсе.
  Валюта замерена там, где её решает этот PR: выбор региона по `default_country` тенанта (`_medusa_country=ru`/`us`,
  триггер «₽»/«$» в шапке). Рендер самой цены диф не трогает — в списке 34 файлов нет ни одного price-компонента.
- **Переключатель на хосте без тенанта** (должен показывать все 36). На стенде не задан
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, поэтому single-store запросы к `/store/*` отвечали 400 и шапка регионов не отрисовалась.
  Редирект-фallback при этом измерен и работает.

## Ниты (в комментарий к PR, не причина отказа)

1. `apps/tenant-panel/src/lib/locale-catalog.ts` — **третья** рукописная копия каталога локалей (storefront `i18n/config.ts`,
   backend `validators.ts`, панель). Общего пакета между apps нет (признано в теле PR), расхождение теперь возможно молча.
   Кандидат в `@upready/*` либо тест-сверка трёх списков.
2. `routes/settings/locale/locale.tsx`: `if (isPending) return <SingleColumnPageSkeleton/>` стоит ПЕРЕД рендером,
   поэтому ветка `disabled={!loaded}` почти недостижима — третье состояние по 19h реализовано, но на экране его показывает
   скелетон, а не задизейбленный реальный контрол. Вреда нет, но заявленная форма 19h не та, что рендерится.
3. Бездефисный флаг `dry-run` у бэкфилла — нестандартная форма; в моём прогоне сработала, но стоит одной строкой в README/деплой-инструкции.
