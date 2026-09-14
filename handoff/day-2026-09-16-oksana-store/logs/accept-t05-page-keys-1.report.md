# Приёмка t05-page-keys · PR #24 · раунд 1 — MERGED

Отчёт составлен 2026-09-15 05:02 WITA. Приёмщик: headless-сессия в главном чекауте (ветка dev, коммитов здесь нет).

## Итог

PR #24 (`feat/day16-page-keys` → `dev`, mergeable=MERGEABLE, mergeStateStatus=CLEAN) принят.
На GitHub он уже был смержен параллельным приёмщиком (`mergedAt=2026-09-14T20:59:33Z`,
merge commit `997933900b7201ac0d14b3ea10d1e6e5497d23c2`) — `gh pr merge 24 --squash` ответил
«was already merged». Замеры ниже сделаны независимо и подтверждают приёмку.

Побочное наблюдение: в БД стенда рядом с моим тенантом `oksana-t05` оказался тенант `t05acc`
(«T05 Accept»), а файлы `/tmp/t05-token.txt`/`/tmp/t05-tenant.json` были перезаписаны чужой
сессией — то есть по этой задаче одновременно шёл второй приёмщик. Свои замеры я переснял
с токеном в отдельном файле `/tmp/acceptor-t05-oksana.token` и с проверкой `GET /tenants/me`
(handle=oksana-t05).

## Стенд

Поднят с нуля в воркдереве `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-page-keys`
(чистое дерево на `origin/feat/day16-page-keys`, HEAD `bbd3ae23115acd15c12d55c266cc67c8d71da057`):
БД `upready_store_t05` создана заново (прежняя, на которой мерил исполнитель, уже удалена),
`npx medusa db:migrate` rc=0 (миграции + сид), backend `medusa develop` на :9250 со
`STOREFRONT_REVALIDATE_URL=http://localhost:8141`, storefront `next dev -p 8141`
(:8041 занят стендом соседней задачи `feat/day16-locale-currency` — чужой процесс не трогал).

## Критерии приёмки — измерено

| Критерий | Замер | Итог |
|---|---|---|
| Владелец создаёт страницу со своим ключом | `POST /tenants/pages {"slug":"delivery","title":"Доставка"}` → **201**, `{"key":"delivery","reserved":false,"in_footer":false}` | ✅ |
| Невалидный слаг отбит | `POST {"slug":"Bad Slug!"}` → **400** `invalid_data: lowercase letters, digits and single hyphens` | ✅ |
| Зарезервированный слаг отбит | `POST {"slug":"about"}` → **400** `"about" is a reserved page key` | ✅ |
| Страница открывается по /<locale>/pages/<key> | `curl --resolve oksana-t05.localhost:8141:127.0.0.1 http://oksana-t05.localhost:8141/ru/pages/delivery` → **http=200**, в HTML заголовок «Доставка» и текст «По всей стране за 3-5 дней» | ✅ |
| Появляется в подвале | футер главной `/ru` содержит ссылку «Доставка» (и «О магазине»); скриншоты `ru-home-footer.png`, `ru-pages-delivery.png` | ✅ |
| Неопубликованная в подвале не появляется | `PUT …/delivery {"published":false}` → ссылок `pages/delivery` в футере **0**, сама страница → **http=404** | ✅ |
| Пять прежних ключей работают | `PUT /tenants/pages/about {"locale":"ru","published":true}` → 200; `/ru/pages/about` → **http=200**, «О магазине» / «Мы продаём»; скриншот `ru-pages-about-reserved.png` | ✅ |
| Зарезервированный ключ нельзя удалить | `DELETE /tenants/pages/about` → **400** `"about" is a reserved page key and cannot be deleted` | ✅ |
| Неизвестный слаг — настоящая 404 | `/ru/pages/unknown-slug` → **http=404**, страница «Страница не найдена» (скриншот `ru-pages-unknown-404.png`); `GET /store/tenant/pages/unknown-slug` → 404 | ✅ |
| Ревалидация без пересборки | `PUT …/delivery {"title":"Доставка ТЕСТ"}` → лог бэкенда `[revalidate] type=tenant.pages handle=oksana-t05 … status=200`, новый заголовок в футере живой витрины через ~6 с, без перезапуска next | ✅ |
| Порядок в подвале | `GET /store/tenant/pages?locale=ru` → `[{"key":"delivery"(footer_order=0)},{"key":"about"(null)}]` — с явным порядком впереди, без порядка в конец | ✅ |

## Проверки

- `cd apps/backend && npx tsc --noEmit` → **rc=0**
- `cd apps/tenant-panel && npx tsc --noEmit` → **rc=0**
- `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9351 pnpm test:integration:http -- tenants-pages` →
  `Tests: 12 passed, 12 total`, `Test Suites: 1 passed` (9 старых + 3 новых блока)
- `… PORT=9352 pnpm test:integration:http` (весь сьют) → `Test Suites: 1 failed, 11 passed, 12 total`,
  `Tests: 1 failed, 128 passed, 129 total`. Единственное падение —
  `tenants-domains.spec.ts › resolves a custom host as soon as the tenant adds it, without a restart`:
  ответ содержит лишнее поле `is_primary: false` против `toEqual`. Этот файл в диффе PR #24 отсутствует
  (список файлов PR проверен), `is_primary` пришёл из уже смерженной задачи x02-domains — не регрессия t05.

## Разбор диффа

- Модель: `key` стал свободным слагом (`PAGE_SLUG_PATTERN`), пятёрка — `isReservedPageKey`; добавлены
  `in_footer`/`footer_order`. Миграция `Migration20260915040800` аддитивная (две колонки + бэкфилл),
  `down()` их снимает; на живой БД не запускалась.
- Витрина не тронута (0 строк) — маршрут `[locale]/(main)/pages/[key]` и так был общим по ключу,
  что я прочитал в коде и подтвердил живым запросом.
- Секретов в коде нет, удалений нет, защищённая инфраструктура не тронута, деплоя не было.

## Ниты (опубликованы комментарием к PR)

1. `POST /tenants/pages` жёстко пишет `locale: "en"`, а `PUT` кастомного ключа с другой локалью → 404:
   кастовую страницу нельзя завести в ru-локали (у пятёрки апсерт по локали работает). На витрине
   спасает фолбэк `pickPageForLocale`.
2. `.snapshot-tenant.json` потерял финальный перевод строки.
3. Бэкфилл миграции ставит `in_footer=true` всем строкам, а не только пятёрке (сегодня эффект нулевой).
