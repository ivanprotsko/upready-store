# b10-panel-gaps — панель: экран редиректов, поле SEO-верификации, удаление страницы, Result URL по https

2026-09-16 03:12 WITA. Ветка `feat/day16-panel-gaps`, worktree
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-panel-gaps`.
Деплоя не было (правило 21c). Единственное касание живого — удаление оставшейся страницы `qa-test-q02`
через панель владелицы, как и просило задание.

## Стенд, на котором всё замерено

Клон БД живого магазина, снятый сегодня:

```
ssh contabo 'docker exec mt-postgres pg_dump -U medusa -d medusa_mt --no-owner --no-acl | gzip -6' > b10-medusa_mt.sql.gz   # 5,3 МБ, rc=0
createdb upready_store_b10 && gunzip -c … | psql -d upready_store_b10                                                        # 0 строк ERROR
psql -d upready_store_b10 -tAc "select handle from tenant; select count(*) from tenant_redirect"
  → …, cherkashino
  → 47
```

- backend `medusa develop` на `:9510` (БД `upready_store_b10`, `127.0.0.1:5433`, `BACKEND_PUBLIC_URL` НЕ задан);
- витрина `next dev` на `:8510`, магазин открывается как `http://cherkashino.localhost:8510/ru`
  (`curl … /ru` → `<title>Оксана Черкашина</title>`);
- панель `vite` на `:5510`, открыта по адресу `http://panel-b10.127.0.0.1.nip.io:5510` — не `localhost`
  специально: так воспроизводится живая цепочка «внешний хост → прокси → бэкенд», в которой и рождался
  `http://` в Result URL.

Все три сервера остановлены после замеров (см. «Что осталось после меня»).

## 1. Экран «Старые адреса» — `/settings/redirects`

Маршруты `/tenants/redirects*` были с `t11-seo-redirects`, экрана не было. Теперь есть: список,
создание, правка цели прямо в строке, удаление с подтверждением, поиск по адресу (у магазина Оксаны
47 правил, поэтому форма добавления стоит НАД таблицей, а не под ней).

Прогон кликами (Playwright, системный Chrome, 1280×900), старый адрес `/ru/b10-staraya-stranica`:

```
до создания:                                        404
завела правило → /ru/pages/about:   301 -> /ru/pages/about       (через 9 с)
изменила цель  → /ru/pages/contacts: 301 -> /ru/pages/contacts   (через 62 с)
удалила правило:                                     404          (через 61 с)
```

Задержка до 60 с — не дефект: витрина перечитывает таблицу редиректов раз в TTL
(`apps/storefront/src/lib/tenant/redirects.ts:12`, `TTL_MS = 60 * 1000`), это поведение `t11`.

Снимки: `shots/b10-01-redirects-list.png` (список 47 правил и форма),
`shots/b10-02-redirect-created.png`, `shots/b10-03-redirect-edited.png`, `shots/b10-04-redirect-deleted.png`.

**Что добавлено в API.** `PUT /tenants/redirects/:id` — правки не было вовсе, и «изменить цель»
означало «удалить правило и набрать старый адрес заново», а в промежутке старый адрес переставал
переадресовывать. Тело называет только то, что меняет; новый `from_path` проверяется на столкновение
тем же способом, что и `POST`.

## 2. Экран «Подтверждение прав в поисковиках» — `/settings/seo`

`PUT /tenants/seo-verification` был с `t11`, поля не было нигде, поэтому в `<head>` магазина код
никогда не попадал (на живом `tenant.metadata.seo_verification` = `null` до сих пор).

```
владелица вставила код b10acceptancemu31iixr → Сохранить
curl -s http://cherkashino.localhost:8510/ru | (head)
  → <meta name="yandex-verification" content="b10acceptancemu31iixr"/>   (через 63 с)
```

Снимок: `shots/b10-05-seo-verification.png`.

Добавлен `GET /tenants/seo-verification` — чтобы форма открывалась заполненной (так же устроен
`/tenants/analytics`, у которого обе половины были с самого начала).

## 3. Удаление страницы

**Находка `q03` уже была закрыта деплоем `d06`, до начала этой задачи.** Кнопка удаления у своих
страниц приехала с `t05-page-keys` (коммит `99793390`, 2026-09-15 04:59 WITA), образ `mt-panel`
пересобран 2026-09-16 01:11 WITA — то есть на живой панели кнопка была уже к моменту постановки
задачи. Проверено кликами (см. пункт 5). Своего кода по этому пункту не потребовалось.

Полный жизненный цикл на стенде, чтобы 404 что-то доказывал (у `qa-test-q02` он и ДО удаления был 404 —
страница не опубликована):

```
/ru/pages/b10-probnaya-stranica до создания:  404
создала через панель, включила «Опубликована»: 200   (через 2 с)
удалила через панель (с подтверждением):       404   (через 0 с)
```

Снимки: `shots/b10-09-page-created.png`, `shots/b10-10-pages-list-with-custom-page.png`,
`shots/b10-11-page-delete-confirm.png`, `shots/b10-12-page-deleted.png`.

## 4. Result URL по `https://`

Замер на живой панели (артефакт `q02-qa-owner/report.md` §4): `http://panel-store.upready.dev/robokassa/result`.
Адрес был неверен дважды — схема `http` и хост ПАНЕЛИ, который `/robokassa/result` не обслуживает вовсе
(nginx панели проксирует только `/auth` и `/tenants`). Причин тоже две, и починены обе:

1. `apps/tenant-panel/nginx.conf` затирал `X-Forwarded-Proto` собственной схемой
   (`proxy_set_header X-Forwarded-Proto $scheme`), а собственная схема nginx внутри compose — всегда
   `http`: TLS снимает traefik перед ним. Теперь заголовок, пришедший снаружи, передаётся дальше, а
   `$scheme` остаётся фолбэком на случай, когда прокси перед нами нет.
2. `resultUrlFor` копировал эту схему в адрес. Теперь `http` остаётся только у локального стенда
   (`localhost`, `127.0.0.1`, `*.localhost`), любой публичный хост — `https`.

Замер обеих веток на стенде (`BACKEND_PUBLIC_URL` не задан):

```
Host: localhost:9510                   http://localhost:9510/robokassa/result
Host: panel-b10.127.0.0.1.nip.io:9510  https://panel-b10.127.0.0.1.nip.io:9510/robokassa/result
Host: panel-store.upready.dev          https://panel-store.upready.dev/robokassa/result
```

На экране владелицы (панель на публичном хосте, полная цепочка «браузер → прокси → бэкенд»):
`https://panel-b10.127.0.0.1.nip.io:5510/robokassa/result`. Снимок: `shots/b10-08-payments-result-url.png`.

Отдельно: на ЖИВОМ хосте `BACKEND_PUBLIC_URL=https://shipshift.dev` задан (замер
`docker exec mt-backend printenv BACKEND_PUBLIC_URL`), и живая панель сегодня уже отдаёт
`https://shipshift.dev/robokassa/result` — это привёз деплой `d06`. Починка выше закрывает случай,
когда переменной нет: раньше он молча давал адрес, на котором Robokassa получала бы HTML панели и
заказ никогда не становился оплаченным.

## 5. Живое касание: страница `qa-test-q02` снесена через панель

```
до удаления  https://cherkashino.shipshift.dev/ru/pages/qa-test-q02 → 404
             https://cherkashino.shipshift.dev/en/pages/qa-test-q02 → 404
             (страница была черновиком в локали en — покупателю она не показывалась никогда)
клик «Удалить» → «Страница удалена»; строк «qa-test-q02» в таблице после удаления: 0
после        /ru/pages/qa-test-q02 → 404, /en/pages/qa-test-q02 → 404
GET /tenants/pages       → contacts, legal, about, privacy, offer
GET /tenants/pages/qa-test-q02 → 404
panel-store.upready.dev → 200, cherkashino.shipshift.dev/ru → 200
```

Снимки: `shots/b10-13-live-pages-before.png`, `shots/b10-14-live-delete-confirm.png`,
`shots/b10-15-live-page-deleted.png`.

## 6. Seam-спеки

Их не было ни у `/tenants/redirects*`, ни у `/tenants/seo-verification` — нитка 1 приёмки PR #29.

```
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9610 pnpm test:integration:http -- tenants-redirects
  Test Suites: 1 passed, 1 total
  Tests:       9 passed, 9 total

… -- tenants-seo-verification
  Test Suites: 1 passed, 1 total
  Tests:       8 passed, 8 total
```

## Проверки

| Проверка | Результат |
|---|---|
| `apps/tenant-panel`: `pnpm typecheck` | rc=0 |
| `apps/tenant-panel`: `pnpm lint` | rc=0, `✖ 24 problems (0 errors, 24 warnings)` — все предсуществующие |
| `apps/backend`: `npx tsc --noEmit` | rc=0 |
| `apps/backend`: `npx medusa lint` | rc=0, `✖ 72 problems (0 errors, 72 warnings)` — все предсуществующие |
| `pnpm check:backend-build` (гейт PR для `apps/backend`) | rc=0 |
| seam `tenants-redirects` | `Tests: 9 passed, 9 total` |
| seam `tenants-seo-verification` | `Tests: 8 passed, 8 total` |
| seam `tenants-payment-settings` (задет `helpers.ts`) | `Tests: 8 passed, 8 total` |

Все три спека прогнаны на дереве ПОСЛЕ мержа `origin/dev` (мерж `a75c0c28`, база `b508bb9c`):

```
STORE_MEDIA_BASE_URL=… DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9610 \
  pnpm test:integration:http -- "tenants-(redirects|seo-verification|payment-settings)"
  Test Suites: 3 passed, 3 total
  Tests:       25 passed, 25 total
```

До мержа один тест в `tenants-payment-settings` был красным (`accepts only a correctly signed Result
webhook and then completes the cart into a paid order`). Проверено, что это не моя правка: тот же
спек на коде базы (`git checkout HEAD~1 -- apps/backend`, прогон, `git checkout HEAD -- apps/backend`)
падал ровно тем же одним тестом. Чинит его `b15-quality-debt` (#68), приехавший в `dev` мержем выше:
в адрес покупателя добавлен `province`, без которого `completeCartWorkflow` отказывает в заказе.
Там же в `.env.template` описан `STORE_PROFILES_MEDIA_BASE_URL`, без которого `POST /tenants/seed`
в `beforeAll` отдавал 500 и красными становились все восемь.

## Что НЕ сделано и почему

- **Правка старого адреса (`from_path`) в экране не выведена.** API умеет (`PUT` принимает все три
  поля и проверяет столкновение), экран даёт править цель и тип. Старый адрес — это и есть
  тождество правила; менять его = завести другое правило, и в форме это один шаг. Если приёмка
  считает иначе — поле добавляется в ту же строку.
- **Массовый импорт правил таблицей** (у Оксаны их 47, приехали скриптом `import-cherkashino-redirects.ts`)
  экраном не покрыт: задача просила список/создание/правку/удаление.
- **Деплой не делался** — задача его не заказывала. До деплоя экраны живут только на ветке; живая
  панель их пока не показывает.
- **Локаль страниц.** У всех строк `tenant_page` магазина Оксаны `locale=en` (видно в замере пункта 5)
  при русском магазине — это нитка `t11` про локаль, к этой пачке отношения не имеет, но объясняет,
  почему `qa-test-q02` и пять готовых разделов не открываются по `/ru/pages/...`.

## Что осталось после меня

| Что | Состояние |
|---|---|
| Страница `qa-test-q02` на живом магазине | удалена через панель, подтверждено `GET /tenants/pages` |
| Живой магазин, панель, контейнеры, DNS | не трогались; `panel-store.upready.dev` → 200, `cherkashino.shipshift.dev/ru` → 200 |
| Стенд `:9510/:8510/:5510` | остановлен |
| БД `upready_store_b10` | локальный клон, оставлен для приёмки; сносится `dropdb upready_store_b10` |
| `apps/*/.env` | локальные, в git не попадают (gitignored) |
