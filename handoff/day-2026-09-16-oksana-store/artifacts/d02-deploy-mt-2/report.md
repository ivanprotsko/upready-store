# d02-deploy-mt-2 — деплой dev на mt-платформу, волна 2 (attempt 2)

Время отчёта: 2026-09-15 06:50 WITA (`date` выше). Часы хоста Contabo — CEST (UTC+2, минус 6 часов от WITA).

## Что смёржено с волны 1

Волна 1 (`d01-deploy-mt-1`) деплоила `bd4ced7`. С неё в `dev` смёржено 8 задач дня (PR #21–#28,
`gh pr list --state merged --search "merged:>=2026-09-15"`, плюс более ранние в тот же search-охват — ниже
только относящиеся к сегодняшним 8 задачам):

| # | PR | Задача |
|---|---|---|
| 1 | #21 | t02-cherkashina-port — перенос миграции магазина Оксаны в dev |
| 2 | #22 | t01-checkout-thankyou — фикс «Application error» на «Спасибо» |
| 3 | #23 | t03-tenant-secrets-robokassa — пер-тенантные секреты интеграций, Robokassa |
| 4 | #24 | t05-page-keys — произвольные страницы магазина |
| 5 | #25 | t04-shipping-tariffs — доставка тенанта: зоны, тарифы, трек |
| 6 | #26 | t06-locale-currency — язык и валюта настраиваются владельцем |
| 7 | #27 | t07-catalog-filters-hero — фильтры каталога без дублей, свой hero |
| 8 | #28 | t08-order-notifications — письмо покупателю + Telegram владельцу |

`git log --oneline bd4ced7..origin/dev` (8 задачных коммитов + служебные handoff/x01/x03-коммиты дня).

## Деплой

- **Sha:** `2508708` (origin/dev на момент запуска), отличается от волны 1 (`bd4ced7`).
- Liveness-проба: `ssh rc=0`.
- Env: забран с хоста через `scp -i ~/.ssh/id_ed25519_contabo`, md5 `b788f1886315a512485e0515aeb8fb53` —
  **совпал** с волной 1: секреты не менялись.
- Дамп БД (перед любой операцией): `/opt/upready-store/backups/mt-medusa_mt-20260915-000508.sql.gz`,
  5 069 981 байт.
- rsync код → хост: без `--delete`, rc=0 (фон, >300 c).
- Сборка (`docker compose build backend storefront panel`): все три образа `Built`, но **cache-hit** —
  слои идентичны образам, уже стоявшим на хосте (созданы 00:09:34–00:14:34 CEST того же дня, т.е. раньше
  запуска build-команды ЭТОЙ сессии в 00:16:24 CEST). Объяснение: более ранняя попытка этой же задачи
  (`d02-deploy-mt-2` attempt 1) уже прогнала rsync+build+up для того же sha 2508708 и, судя по всему,
  оборвалась до печати `RESULT:` (как и в известном случае с x03, из-за чего задачу перезапускают с нуля).
  Эта сессия (attempt 2) переделала rsync (rc=0, код идентичен) и build (100% cache) — результат тот же
  самый образ, соответствующий текущему `origin/dev`. Контейнеры на момент первой проверки уже были
  `Up ~21–23 минуты` (подняты предыдущей попыткой), `docker compose up -d` этой сессии подтвердил их
  здоровыми, не пересоздавая.
- **Миграции:** 4 новые миграции модуля `tenant` (`Migration20260914193724`, `Migration20260915040800`,
  `Migration20260915042009`, `Migration20260915045704`) из PR #21/#23/#24. `medusa db:migrate` в контейнере
  `mt-backend`: `MODULE: tenant — Skipped. Database is up-to-date for module.` — уже применены (та же
  attempt 1). Ошибок нет.
- **Бэкфиллы:**
  - `backfill-hero-copy.js`: 13 home documents, 0 patched, 13 left alone (уже свои копии/локализованы).
  - `backfill-option-translations.js`: profile "sneakers", 5 options × 36 locales: 0 rewritten, 0 created,
    1224 already right.
  - Оба идемпотентны, повторный прогон подтверждает — новых правок не требовалось (тоже сделаны attempt 1).

## Переменные окружения — новые для сегодняшних задач

Смёрженные задачи добавили опциональные переменные (`deploy/mt/shipshift.env.example`, PR #28):

| Переменная | Назначение | На хосте есть? |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_REPLY_TO` | письмо покупателю о заказе | **нет** — платформенный SMTP-аккаунт не задан Иваном |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_SECRET` | Telegram-уведомление владельцу через @upreadystore_bot | **нет** |
| `INTEGRATION_ENCRYPTION_KEY` (Robokassa/секреты тенантов, PR #23) | шифрование пер-тенантных секретов | **есть**, уже стояла |

Код ведёт себя ровно так, как документировано (`medusa-config.ts: useSmtp = Boolean(SMTP_HOST)`) — при
пустом `SMTP_HOST` провайдер не регистрируется, backend не падает. Живое подтверждение в логах `mt-backend`
(за последние 30 минут):
```
[order-placed-email] Failed to send the letter for order order_01M2H1PTXG9AA891PXEM78QF12 …
Could not find a notification provider for channel: email …
```
Это залогированная недоставка, а не крэш — корректный исход при незаполненной переменной. Аналогично
Telegram-уведомление владельцу тихо не отправится (пустой `TELEGRAM_BOT_TOKEN`), это не проверялось живым
заказом в рамках этого прогона.

**Не трогал:** `LOCALE_COUNTRY_MAP` — проверил код (`apps/storefront/src/lib/geolocation/locale-country.ts`)
и `deploy/compose.mt.yml` — переменная уже задаётся дефолтом самого compose-файла
(`${LOCALE_COUNTRY_MAP:-ru:ru,en:us}`), поэтому в `shipshift.env` она не нужна; я по ошибке дописал её туда
явно тем же значением, пересобрал `storefront`, затем откатил правку (md5 после отката снова
`b788f1886315a512485e0515aeb8fb53` — совпадает с исходным) и пересоздал контейнер ещё раз на восстановленном
файле. Функционально ничего не менялось (значение совпадало с дефолтом на обоих шагах).

## Health-checks (5/5 = 200)

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

Проверено и ДО деплоя (см. HANDOFF-статус этой сессии в начале прогона) — `cherkashino` уже отдавал 200,
падения не было.

Дополнительно (реестр protected-infra `upready-store-mt-platform`):
- onboarding 200, panel 200, hero-image 200, tenant subdomain `zolotaya-nit-1057.shipshift.dev/` → 302 (редирект
  на `/ru`, ожидаемое поведение) с валидным TLS (`ssl_verify_result=0`).

## Каталог клиента — не демо

`GET /store/products?limit=1` с публикуемым ключом тенанта cherkashino
(`pk_8198573d694d799176db98d87e17e5d53b073cf905ce0b050f72e443331f1e31`, sales channel
`sc_01M2GQVE0NVSWBRT9Q082MPDYE`) → **`count: 29`**, первый товар — «Свечи АСД с чесноком» (реальный товар
Оксаны, не demo-каталог). Совпадает с зафиксированным в x01-tenant-live-import (29 опубликованных из 38).

## Контейнеры (`docker ps`, mt-*)

```
mt-backend       Up 29 minutes (healthy)
mt-ingress-sync  Up 3 days
mt-panel         Up 27 minutes (healthy)
mt-postgres      Up 3 days (healthy)
mt-storefront    Up 27 minutes (healthy)
```

## Образы (mt-*)

```
mt-storefront:latest 2026-09-15 00:14:34 +0200 CEST
mt-backend:latest    2026-09-15 00:11:58 +0200 CEST
mt-panel:latest      2026-09-15 00:09:34 +0200 CEST
```

Эти timestamp — начало прогона attempt 1 той же задачи (00:04–00:16 CEST), не attempt 2. `docker compose
build` этой сессии подтвердил их содержимое идентичным текущему rsync-снимку `origin/dev` (100% cache hit),
так что образы соответствуют деплоенному sha `2508708`, хотя физически не пересозданы именно ЭТИМ вызовом
build. Фиксирую как факт, не подгоняю под критерий «пересобрано этим прогоном».

## Что удивило / находки

1. **Attempt 1 этой же задачи, похоже, уже почти всё сделал** (rsync, build, up, миграции, бэкфиллы) и
   оборвался до отчёта — все проверенные шаги оказались идемпотентными подтверждениями, а не новой работой.
   Известный класс проблемы (как с x03, см. прошлый прогон): нет печати `RESULT:` → перезапуск с нуля.
2. **SMTP и Telegram для order-notifications не настроены на хосте** — оба свежих канала уведомлений
   (PR #28) молчат: письмо логируется как недоставленное, Telegram не проверялся отдельно. Это решение
   Ивана (платформенный SMTP-аккаунт и токен бота — не то, что можно придумать самому).
3. Моя собственная лишняя правка `shipshift.env` (добавление `LOCALE_COUNTRY_MAP` без необходимости, см.
   выше) — откачена, файл восстановлен побайтово (md5 совпал).

## Итог

Платформа обслуживает все 5 проверяемых URL кодом 200 (включая живой магазин `cherkashino`, который был
200 и до, и после), все `mt-*` контейнеры Up/healthy, БД задампена перед операцией, 4 новые миграции модуля
`tenant` применены, бэкфиллы идемпотентно подтверждены, каталог клиента — 29 реальных товаров, не демо.
Единственный незакрытый пункт — отсутствующие SMTP/Telegram-переменные для order-notifications, что по
рецепту задачи корректный исход («функция молчит, потому что переменная не задана»), а не дефект деплоя.
