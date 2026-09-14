# d02-deploy-mt-2 — деплой dev на mt-платформу, волна 2

Время отчёта: 2026-09-15 06:26 WITA. Часы хоста Contabo — CEST (UTC+2); в логах/таймстемпах образов и контейнеров ниже — время хоста.

## Проверка ДО деплоя

`https://cherkashino.shipshift.dev/ru` уже отвечал 200 до начала работы (магазин Оксаны создан задачей `x01-tenant-live-import` до этого деплоя) — падение платформы этим деплоем не вызвано бы, если бы адрес был красным изначально.

## Что смёржено с волны 1 (sha `bd4ced7`)

`git log --oneline bd4ced7..origin/dev` + `gh pr list --state merged --search "merged:>=2026-09-15"`:

| PR | Задача |
|---|---|
| #21 | t02-cherkashina-port — миграция магазина Оксаны в dev |
| #22 | t01-checkout-thankyou — фикс страницы «Спасибо» |
| #23 | t03-tenant-secrets-robokassa — пер-тенантные секреты, приём оплат Robokassa (тест) |
| #24 | t05-page-keys — произвольные страницы магазина |
| #25 | t04-shipping-tariffs — доставка: зоны, тарифы, трек |
| #26 | t06-locale-currency — язык/валюта магазина |
| #27 | t07-catalog-filters-hero — фильтры каталога, свой hero |
| #28 | t08-order-notifications — уведомления о заказе (e-mail + Telegram) |

Итого 8 задач за сегодня. Деплоится sha `2508708` (было `bd4ced7`).

## Находка №1 (важная): локальный `dev`-чекаут разошёлся с `origin/dev`

Рабочее дерево сессии содержало journal-коммиты о приёмке PR #21…#28 («MERGED»), но САМИХ merge-коммитов
кода в его истории не было (`git merge-base --is-ancestor origin/dev HEAD` → false, `git merge --ff-only
origin/dev` падал с «Not possible to fast-forward»). Rsync с рабочего дерева задеплоил бы вчерашний код при
формально «зелёном» состоянии. Решение: код для rsync экспортирован ЧИСТО из `origin/dev` командой
`git archive origin/dev | tar -x -C /tmp/d02-deploy-src`, без merge/rebase локальной ветки (риск конфликтов
на общих handoff-файлах, которые параллельно пишут другие сессии дня, не тронут). Rsync прошёл с этого
дерева. Локальная ветка `dev` в этом чекауте осталась как была — не push'илась, не мержилась.

## Деплой

- **Liveness-проба:** `ssh rc=0`.
- **Env:** забран с хоста (`scp -i ~/.ssh/id_ed25519_contabo`), md5 `b788f1886315a512485e0515aeb8fb53` —
  СОВПАДАЕТ с копией волны 1 (не менялся между волнами). После rsync хостовый файл проверен ещё раз — тот
  же md5 (rsync без `--delete` и без `.env` в экспортированном дереве его не тронул).
- **Дамп БД (до операции):** `/opt/upready-store/backups/mt-medusa_mt-20260915-000636.sql.gz`,
  **5 069 986 байт**, создан 2026-09-15 00:06:40 CEST этим прогоном.
- **rsync код → хост:** из `/tmp/d02-deploy-src` (см. находку №1), без `--delete`, rc=0.
- **Сборка** (`docker compose build backend storefront panel`): лог
  `/opt/upready-store/mt-build-20260915-000825.log`. Все три образа собраны (`Built`): `mt-backend`,
  `mt-storefront`, `mt-panel`.
- **`docker compose up -d` — с первой попытки НЕ прошёл** (находка №2, ниже). Со второй — все 5 контейнеров
  `Up (healthy)`.
- **Миграции** (модуль `tenant`, применились автоматически при старте `mt-backend`,
  `docker-entrypoint.sh` → `medusa db:migrate`), все 4 успешно:
  - `Migration20260914193724` — `tenant_integration_secret` (t03, секреты Robokassa) — ✔ Migrated
  - `Migration20260915040800` — `tenant_page.in_footer`/`footer_order` (t05) — ✔ Migrated
  - `Migration20260915042009` — `tenant_locale_settings` (t06) — ✔ Migrated
  - `Migration20260915045704` — `tenant_notification_settings` (t08) — ✔ Migrated
- **Бэкфиллы:**
  - `backfill-hero-copy.js`: 13 home documents, 0 patched, 13 left alone (своя копия/уже локализовано/нет hero).
  - `backfill-option-translations.js`: profile "sneakers", 5 options × 36 locales: 0 rewritten, 0 created,
    1224 already right.
- **Seed:** демо-тенанты `acme`/`globex`/`initech` уже существуют — `seed-mt-demo.js` не запускался.

## Находка №2: `docker compose up -d` не прошёл с первой попытки (не критично, само устранилось)

Первый `up -d` вышел с `dependency failed to start: container mt-backend is unhealthy` — `mt-backend`
пересобирался и не успел пройти healthcheck (`start_period: 90s` + миграции/сиды/аккаунты внутри
entrypoint заняли дольше, чем ждал compose), из-за чего `mt-panel`/`mt-storefront` остались в состоянии
`Created`, не запущенными. Проверка `docker ps` показала, что `mt-backend` на самом деле стал `Up (healthy)`
через ~2 минуты после ошибки. Повторный `docker compose up -d` (без down/rebuild) поднял `mt-panel` и
`mt-storefront` штатно. Рецепт волны 1 стоит дополнить: после `up -d` проверять `docker ps`, и при
`dependency failed to start` — просто повторить `up -d`, не трогая тома/образы.

## Находка №3 (баг в коде PR #23/#28, не в конфигурации хоста): новые env-переменные не проброшены в `compose.mt.yml`

Сегодняшние задачи добавили в `deploy/mt/shipshift.env.example` переменные `BACKEND_PUBLIC_URL` (t03),
`SMTP_HOST/PORT/SECURE/USER/PASS/FROM/REPLY_TO` и `TELEGRAM_BOT_TOKEN/USERNAME/LINK_SECRET` (t08), но
**`deploy/compose.mt.yml` их не прокидывает** в `environment:` секции `backend` (замер:
`grep -n "SMTP\|TELEGRAM\|BACKEND_PUBLIC_URL" deploy/compose.mt.yml` = 0 совпадений на sha `2508708`).
Даже если Иван впишет значения в `shipshift.env` на хосте, они НЕ дойдут до контейнера, пока кто-то не
допишет `compose.mt.yml`. Backend от их отсутствия не падает (`useSmtp = Boolean(SMTP_HOST)` — при пустом
значении провайдер просто не регистрируется), так что это не авария, а незавершённая проводка — заводится
отдельной задачей.

## Переменные окружения — что отсутствует на хосте (для отчёта Ивану, не выдумано)

На хосте в `shipshift.env` СЕЙЧАС нет значений (пусто/строки нет) для:
`BACKEND_PUBLIC_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`SMTP_REPLY_TO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_SECRET`.
`INTEGRATION_ENCRYPTION_KEY` уже установлен (нужен для шифрования секретов Robokassa) — он единственный
из новых зависимостей, что реально есть. Функции уведомлений/Robokassa-URL остаются выключенными — корректный
исход по правилам задачи, а не поломка (плюс находка №3 выше — они всё равно не заработали бы даже при
заполненных значениях, пока не поправлен `compose.mt.yml`).

## Health-checks (5/5 = 200)

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

Дополнительно (реестр protected-infra, `upready-store-mt-platform`):
`https://shipshift.dev/static/store-profiles/abstract/home-hero.webp` → 200.

Соседняя защищённая инфраструктура (реестр, `agentcreatr-tribute-webhook`) не задета:
`hooks.svgnoon.upready.dev/health` → 200, `POST …/webhook/tribute` → 401 (ожидаемо, подпись не пройдена),
контейнеры `agentcreatr-bridge`/`coolify-proxy` — Up.

## Каталог Оксаны — не демо, живые товары

Через реальный браузер (Superset browser pane) открыта `https://cherkashino.shipshift.dev/ru/store`:
заголовок вкладки «Магазин | Оксана Черкашина», на первой странице каталога — 12 уникальных карточек
товаров (`a[href*="/products/"]`), внизу пагинация «1 | 2 | 3» (3 страницы). Перекрёстная проверка по БД
(`product_sales_channel` для sales channel `sc_01M2GQVE0NVSWBRT9Q082MPDYE` = «Оксана Черкашина»):
**38 активных товаров** — совпадает с 3 страницами по ~12–14 и с числом из отчёта `x01-tenant-live-import`
(38 товаров, 334 файла). Скриншот: `handoff/day-2026-09-16-oksana-store/artifacts/d02-deploy-mt-2/cherkashino-store.png`.

## Контейнеры (`docker ps`, mt-*)

```
mt-backend     Up (healthy)
mt-panel       Up (healthy)
mt-postgres    Up 3 days (healthy)
mt-storefront  Up (healthy)
mt-ingress-sync Up 3 days
```

## Образы (mt-*, все пересобраны этим прогоном — окно 00:08–00:19 CEST)

```
mt-storefront:latest 2026-09-15 00:14:34 +0200 CEST
mt-backend:latest    2026-09-15 00:11:58 +0200 CEST
mt-panel:latest      2026-09-15 00:09:34 +0200 CEST
```

Все три `CreatedAt` попадают в окно этого прогона — доказательство, что новый код обслуживает трафик
(на хосте `.git` нет).

## Итог

Платформа обслуживает все 5 проверяемых URL кодом 200, все `mt-*` контейнеры Up/healthy, БД задампена,
код на хосте — чистый `origin/dev` sha `2508708`, 4 новые миграции применились без ошибок, каталог Оксаны
цел (38 товаров, не демо). Две находки для Ивана: (1) не проброшены новые env в `compose.mt.yml`
(PR #23/#28), (2) рецепт `up -d` из волны 1 не учитывает гонку с healthcheck при пересборке `mt-backend` —
чинится повтором команды, но стоит поправить документацию рецепта.
