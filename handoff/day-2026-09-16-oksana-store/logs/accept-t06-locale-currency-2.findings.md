# Приёмка PR #26 · t06-locale-currency · раунд 2 — ПРОМЕЖУТОЧНОЕ СОСТОЯНИЕ

Приёмщик: headless `claude -p`, главный чекаут `dev`. Промпт диспетчера пришёл 2026-09-15 05:12 WITA.
PR: https://github.com/ivanprotsko/upready-store/pull/26 · ветка `feat/day16-locale-currency` · база `dev`.

## Гонка с воркером (это НЕ находка против воркера)

Раунд 2 приёмки запущен ОДНОВРЕМЕННО с началом ребейза, который потребовал раунд 1.

| Что | Замер |
|---|---|
| `git ls-remote origin refs/heads/feat/day16-locale-currency` (05:13:17) | `efebc4048a4a2e53644c36c6fff8099f2d4984ae` — не изменился с раунда 1 |
| `gh pr view 26 --json mergeable,mergeStateStatus,updatedAt` | `CONFLICTING` / `DIRTY` / `2026-09-14T21:05:37Z` |
| `.git/worktrees/day16-locale-currency/MERGE_HEAD` | `b2453fb2140ff8c8947d229e06cf9a13934a7da6` (== `origin/dev`), mtime 05:11 |
| `git diff --name-only --diff-filter=U` в worktree (05:13) | пусто — все 5 конфликтов уже разрешены в индексе, коммита ещё нет |
| `git rev-list --left-right --count origin/dev...HEAD` | 5 / 5 |

Конфликтовавшие файлы (те же, что в раунде 1, плюс журнал): `HANDOFF.json`,
`apps/backend/src/modules/tenant/models/tenant.ts`, `apps/backend/src/modules/tenant/service.ts`,
`apps/tenant-panel/src/app.tsx`, `apps/tenant-panel/src/routes/home/home.tsx`.

Прогоны проверок в worktree приёмщиком НЕ запускались: дерево в середине мержа, любой `tsc`/`pnpm test`
там замерял бы промежуточное состояние, а не то, что уедет в PR (18f).

## Ревью запушенного кода (`origin/dev...origin/feat/day16-locale-currency`) — стоп-факторов нет

- Миграция `apps/backend/src/modules/tenant/migrations/Migration20260915042009.ts` аддитивная:
  `create table if not exists "tenant_locale_settings"` + два партиальных индекса + FK на `tenant`;
  `down` дропает только свою таблицу. Существующих таблиц не касается, бэкап не требуется.
- Секретов в дифе нет. Удалений файлов нет. Protected-infra не затронута. Деплоя в дифе нет.
- Env-переменные `STOREFRONT_DEFAULT_LOCALE`/`LOCALE_PIN`/`LOCALE_COUNTRY_MAP` сохранены как fallback
  для запроса, не разрешившего тенанта (`resolve.ts` возвращает `locale: null`, `middleware.ts` идёт
  прежней веткой) — «What NOT to do» соблюдено.
- `_medusa_locale` в решение о редиректе НЕ введён: решает `_medusa_locale_choice`, затем
  `matchBrowserLocale(accept-language, {allowed: enabled_locales, preferred: [default_locale]})`,
  затем `default_locale` тенанта.
- Пересчёта курсов нет: `default_country` задаёт регион (`tenantLocaleCountryMap`), цены берутся
  существующие.
- Каталог 36 локалей не урезан, `messages/` не тронут.
- Панель `routes/settings/locale/locale.tsx` следует 19h: `touchedRef` + третье состояние `loaded` +
  `disabled={!loaded}` на всех трёх контролах.
- Валидаторы: `enabled_locales` непустой, без повторов, обязан содержать `default_locale` (zod `.refine`).
- Backfill `src/scripts/backfill-tenant-locale-settings.ts` идемпотентен по построению: строит
  `covered` из `listTenantLocaleSettings({})` и пропускает покрытых; `dry-run` поддержан.

## Что осталось замерить в следующем раунде (перенесено из раунда 1 + новое)

1. `origin/feat/day16-locale-currency` должен указывать на коммит с мержем `dev`, PR — `MERGEABLE`.
2. Перепрогон после ручного склеивания четырёх компиляционных конфликтов (19c: склейка проверяется
   только прогоном): `cd apps/backend && npx tsc --noEmit`; `cd apps/tenant-panel && pnpm typecheck`;
   `cd apps/storefront && npx tsc --noEmit && pnpm test`.
3. Живые замеры стенда двух тенантов, приёмщиком ещё не перепроверенные: `curl -I` по двум хостам
   (`/ru` + ₽ и `/en` + своя валюта из ОДНОГО процесса витрины), `Accept-Language: de` → `/ru`,
   скриншоты обеих главных и переключателя языков.
4. Два предсуществующих падения, названные в теле PR (`tenants-domains.spec.ts`,
   `profile-data.unit.spec.ts`) — читать строку `ℹ fail` целиком по файлу.
5. Нит раунда 1: `apps/tenant-panel/src/lib/locale-catalog.ts` — третья рукописная копия каталога
   локалей (storefront `i18n/config.ts`, backend `validators.ts`, панель). Расхождение возможно
   молча. Кандидат в `@upready/*` либо тест-сверка. Не причина отказа.
