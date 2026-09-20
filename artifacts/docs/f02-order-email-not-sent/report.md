# f02-order-email-not-sent — письмо о заказе не уходит, а магазин пишет «подтверждение отправлено»

Замерено 2026-09-15 10:32 WITA, ветка `fix/day16-order-email`, база `dev` (`46b52b7`).

## Коротко

Витрина больше не обещает письмо, которого не было. А вот причина отсутствия письма
оказалась **не той**, что записана в задаче: репозиторий в порядке уже сейчас, сломан
**хост** — там лежит устаревшая копия `compose.mt.yml`. Деплой я не делал (правило 21c),
ниже — ровно то, что нужно сделать Ивану.

## Находка №1: п.1 задачи оказался не нужен — переменные уже проброшены

Задача (со ссылкой на отчёт d02, находка №3) утверждает: «`deploy/compose.mt.yml` не
передаёт в сервис `backend` ни одной из них (`grep` = 0 совпадений на задеплоенной
sha `2508708`)». Проверил дословно — **не воспроизводится**:

```
$ git show 2508708:deploy/compose.mt.yml > /tmp/compose-2508708.yml
$ grep -c "SMTP\|TELEGRAM\|BACKEND_PUBLIC_URL" /tmp/compose-2508708.yml
13
$ grep -c "SMTP\|TELEGRAM\|BACKEND_PUBLIC_URL" deploy/compose.mt.yml      # HEAD
13
$ git log --oneline -S 'SMTP_HOST: ${SMTP_HOST:-}' -- deploy/compose.mt.yml
2508708 feat(notifications): Уведомления о заказе: письмо покупателю и Telegram владельцу (t08-order-notifications) (#28)
```

То есть t08 добавил переменные в `compose.mt.yml` **тем же коммитом**, что и в
`shipshift.env.example`. Гранью `0 совпадений` обладает не репозиторий, а файл **на хосте**:

```
$ ssh … root@84.46.251.149 'grep -cE "SMTP|TELEGRAM|BACKEND_PUBLIC_URL" /opt/upready-store/mt/deploy/compose.mt.yml'
0
$ ssh … 'stat -c "%y %n" /opt/upready-store/mt/deploy/compose.mt.yml'
2026-09-14 07:07:40.000000000 +0200 /opt/upready-store/mt/deploy/compose.mt.yml
$ ssh … 'docker inspect mt-backend --format "{{.Created}}"'
2026-09-14T22:19:44.207392108Z
```

Код на хост едет `rsync`-ом без `.git` (см. research «Стенды/деплой»), и копия compose
осталась **до-t08-шной**: контейнер пересобран 14-го вечером из свежего образа, но
переменные ему даёт старый compose. Отсюда и симптом — в контейнере переменных **нет
вовсе**, а не «есть, но пустые»:

```
$ ssh … 'docker exec mt-backend env | grep -cE "^SMTP_"'
0
```

`BACKEND_PUBLIC_URL` в контейнере тоже нет, хотя в репозиторном compose он задан
безусловно (строка 88) — это и есть решающая улика, что читается старый файл.

**Дрейф repo → host, 14 ключей блока `backend`** (`comm` по именам переменных):

```
BACKEND_PUBLIC_URL PANEL_PUBLIC_URL SMTP_FROM SMTP_HOST SMTP_PASS SMTP_PORT
SMTP_REPLY_TO SMTP_SECURE SMTP_USER STORE_ADDRESS STORE_PHONE
TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_LINK_SECRET
```

## Находка №2: подвал письма в mt-стеке не получал телефон и адрес

Единственная настоящая дырка проводки в репозитории. `emails/i18n/constants.ts` читает
`STORE_ADDRESS`/`STORE_PHONE`, `compose.stand.yml` их передаёт (строки 120-121), а
`compose.mt.yml` — нет. Добавил в том же необязательном стиле (`${VAR:-}`), плюс строки в
`shipshift.env.example`. `TELEGRAM_API_BASE` намеренно **не** добавлял: это тестовый шов с
дефолтом `https://api.telegram.org`, в проде ему делать нечего.

## Что изменено

| Файл | Что |
|---|---|
| `apps/storefront/messages/*.json` (36 шт.) | ключ `OrderDetails.confirmationSentBefore` → `OrderDetails.contactEmailBefore` с новым текстом; новый `OrderCompleted.keepOrderNumber`. Живой перевод в каждой локали, регистр (ты/вы, du/Sie, tu/você) взят из соседних строк того же каталога |
| `apps/storefront/src/modules/order/components/order-details/index.tsx` | рендерит `contactEmailBefore` |
| `apps/storefront/src/modules/order/templates/order-completed-template.tsx` | добавлена строка «Сохраните номер заказа…» (`data-testid="order-keep-number"`) |
| `apps/storefront/src/modules/order/components/order-details/copy.test.ts` | новый тест: ни в одной из 36 локалей не осталось обещания письма |
| `deploy/compose.mt.yml` | `STORE_PHONE`, `STORE_ADDRESS` в блок `backend` |
| `deploy/mt/shipshift.env.example` | те же две строки с комментарием |

### Почему «сказать правду», а не «показывать по факту отправки»

Задача предлагала выбрать из двух. Выбрал первое, и вот по коду почему:

- витрина о письме **не знает**: страница `/order/[id]/confirmed` — серверный компонент
  над `retrieveOrder()`, никакого статуса доставки в `StoreOrder` нет;
- статус доставки в бэкенде есть, но не той гранулярности: `recordDelivery()`
  (`tenant-notifications/delivery-status.ts`) пишет **последнюю попытку по каналу на
  тенанта**, а не факт по конкретному заказу, и лежит за авторизацией владельца
  (`/tenants/notification-settings`). Гостю его не отдать, не заведя новый store-маршрут;
- и главное: «провайдер настроен» ≠ «письмо ушло» — отправка может упасть и при живом
  SMTP. Условный вариант остался бы способен соврать, безусловная правда — нет.

Так что страница теперь говорит то, что верно всегда, и добавляет покупателю то, с чем
он реально остаётся, — номер заказа. Это и есть «показать ждущему человеку», которого в
логе оператора видно, а на экране не было.

## Замеры (правило 18f)

Стенд поднят локально из этой ветки: бэкенд `medusa develop` на `:9010` против
`upready_store_t08` (241 регион, каталог, тенанты `acme`/`globex`), витрина `next dev`
на `:8010`. **SMTP в `apps/backend/.env` намеренно не задан вовсе** — ровно состояние
живого mt-backend.

### 1. compose парсится, переменные резолвятся

```
$ git grep -n "SMTP_HOST\|TELEGRAM_BOT_TOKEN\|BACKEND_PUBLIC_URL" -- deploy/compose.mt.yml
deploy/compose.mt.yml:88:      BACKEND_PUBLIC_URL: https://${ENGINE_DOMAIN}
deploy/compose.mt.yml:114:      SMTP_HOST: ${SMTP_HOST:-}
deploy/compose.mt.yml:123:      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}

$ docker compose -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env.example config
config rc=0
      BACKEND_PUBLIC_URL: https://shipshift.dev
      SMTP_FROM: ""
      SMTP_HOST: ""
      …
      STORE_ADDRESS: ""
      STORE_PHONE: ""
      TELEGRAM_BOT_TOKEN: ""
```

### 2. Без SMTP бэкенд поднимается и заказ проходит

```
$ npx medusa develop            # apps/backend/.env без единой строки SMTP_
info:    Linting project...
✔ Server is ready on port: 9010 – 4568ms
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9010/health
200
```

Настоящая покупка через store API (корзина → адрес → доставка → оплата → complete):

```
$ curl -s -X POST http://localhost:9010/store/carts/cart_01M2HE83MVMZG0TQ89542QTKB2/complete
  -> 200
ORDER PLACED: id=order_01M2HE84NFRF0ADR2J746QPFNE display_id=20 email=f02-smtp-unset@example.test
```

И тот же самый лог, что на живом хосте, — симптом воспроизведён один в один:

```
error:   [order-placed-email] Failed to send the letter for order order_01M2HE84NFRF0ADR2J746QPFNE
         to f02-smtp-unset@example.test: Could not find a notification provider for channel: email
         for notification id noti_01M2HE84V0NYVGTSQYCMZ9093Q
```

Заказ при этом **оформлен** (`display_id=20`): падение письма не роняет покупку.

### 3. Страница заказа: до и после, один стенд, один заказ

Замерял curl-ом по одному и тому же адресу, переключая только код
(`git checkout 46b52b7 -- <3 файла>` → замер → `git checkout HEAD -- <те же 3>`);
дерево после этого чистое.

**БЫЛО** (`46b52b7`, `http_code=200`):

> Спасибо! Ваш заказ успешно оформлен. **Подтверждение заказа отправлено на** buyer-nosmtp@acme.test. Дата заказа: 15 сентября 2026 г. Номер заказа: 19

**СТАЛО** (HEAD, `http_code=200`):

> Спасибо! Ваш заказ успешно оформлен. **Заказ оформлен на адрес** f02-smtp-unset@example.test. Дата заказа: 15 сентября 2026 г. Номер заказа: 20
> **Сохраните номер заказа. Он понадобится, чтобы связаться с магазином.**

Проверка по подстрокам в отрендеренном HTML:

```
БЫЛО : "Подтверждение заказа отправлено": true   "Сохраните номер заказа": false
СТАЛО: "Подтверждение заказа отправлено": false  "Сохраните номер заказа": true
```

Единственное оставшееся «отправлено» на странице — ключ `transferEmailSent` внутри
сериализованного payload next-intl (перенос заказа в аккаунт), на экран не выводится.

Скриншот живой страницы (человеческими глазами, 1280×900, тёмная тема):
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-order-email/artifacts/docs/f02-order-email-not-sent/after-order-confirmed-1280x900.png`

### 4. Проверки репозитория

```
$ npx tsc --noEmit                 # rc=0
$ npx next lint                    # rc=0, ✔ No ESLint warnings or errors
$ npx vitest run …                 # rc=0, Test Files 15 passed (15), Tests 146 passed (146)
$ npx next build                   # rc=0
$ node -e '<паритет каталогов из AGENTS.md>'
checked 36 catalogs against 471 keys      # ни одного missing/extra
```

## Что должен заполнить Иван

Две разные вещи, и **первая важнее** — без неё заполнение секретов ничего не изменит.

**Шаг 1. Довезти compose на хост** (это деплой, поэтому не делал — правило 21c).
`/opt/upready-store/mt/deploy/compose.mt.yml` отстал от репозитория на 14 ключей
(список выше). После `rsync` из ветки + `up -d` в контейнер приедут `BACKEND_PUBLIC_URL`
и `PANEL_PUBLIC_URL` — **их заполнять не нужно**, compose выводит их из уже заданных на
хосте `ENGINE_DOMAIN` и `PANEL_DOMAIN`.

**Шаг 2. Дописать секреты в `/opt/upready-store/mt/deploy/mt/shipshift.env`**
(единственная копия секретов, вне git; я его не трогал). Сейчас там **нет ни одной**
из этих строк — проверено по именам, значения не читал:

Чтобы письмо покупателю вообще уходило (без `SMTP_HOST` провайдер не регистрируется):

| Переменная | Что это |
|---|---|
| `SMTP_HOST` | **обязательна** — пустая = провайдера нет, письмо снова будет падать |
| `SMTP_PORT` | `587` для STARTTLS, `465` для implicit TLS |
| `SMTP_SECURE` | `false` для 587, `true` для 465 |
| `SMTP_USER` | логин ящика платформы |
| `SMTP_PASS` | пароль/токен |
| `SMTP_FROM` | конверт-отправитель, обычно тот же ящик, что `SMTP_USER` |
| `SMTP_REPLY_TO` | куда идёт ответ покупателя, если магазин не задал свой |

Подвал письма (необязательно, добавлено этим PR):

| `STORE_PHONE`, `STORE_ADDRESS` | телефон и адрес в подвале всех писем; пусто = пустая строка |

Telegram владельцу магазина (отдельный канал, тоже сейчас мёртв):

| `TELEGRAM_BOT_TOKEN` | тот же токен, на котором крутится контейнер `upreadystore-bot` (`/opt/upready-store-bot/.env`, `TELEGRAM_UPREADY_STORE_BOT`) |
| `TELEGRAM_BOT_USERNAME` | пусто = `upreadystore_bot` |
| `TELEGRAM_LINK_SECRET` | общий секрет для `POST /telegram/link`; **то же значение** в `.env` бота. Пусто = маршрут отказывает всем |

## Чего НЕ сделано и почему

- **Деплой не делал** — правило 21c, только по команде Ивана. Поэтому на живом магазине
  письмо по-прежнему не уходит, и страница по-прежнему обещает его: там крутится старый
  образ витрины. Оба пункта чинятся одним деплоем этой ветки после мерджа.
- **`shipshift.env` на хосте не трогал** — секреты Ивана, и файл вне git.
- **Браузерный прогон `tests/stands/checkout.pw.ts` не гонял**: он требует Docker-образ
  Playwright, а локальный docker-демон (colima) не поднят. Вместо него — настоящий
  заказ через store API и рендер страницы curl-ом + скриншот headless Chrome.
- **Сам заказ письмом не подтверждён** — подтвердить нечем, пока нет SMTP-секретов.
  Как только шаг 2 сделан, проверка занимает минуту: оформить заказ на живой витрине и
  посмотреть `docker logs mt-backend --since 5m | grep order-placed-email` — там должно
  стать `Sent to <адрес>` вместо `Failed to send`.
- **Побочное наблюдение, не моё:** на старом стендовом дампе `upready_store_t08` бэкенд
  пишет `relation "tenant_locale_settings" does not exist` — недокатанная миграция этой
  конкретной локальной базы. К живому хосту и к этой задаче отношения не имеет.

## Как принять за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-order-email

# 1. Проводка на месте и compose парсится
git grep -n "SMTP_HOST\|TELEGRAM_BOT_TOKEN\|BACKEND_PUBLIC_URL\|STORE_PHONE" -- deploy/compose.mt.yml
docker compose -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env.example config >/dev/null; echo "rc=$?"

# 2. Обещания письма не осталось ни в одной локали, и это проверяет тест
cd apps/storefront && npx vitest run src/modules/order && npx tsc --noEmit && npx next lint

# 3. Глазами: скриншот страницы заказа
open ../../artifacts/docs/f02-order-email-not-sent/after-order-confirmed-1280x900.png
```

Полный стенд, если хочется своими руками: `apps/backend/.env` с
`DATABASE_URL=postgres://ivanprotsko@localhost:5433/upready_store_t08`, `PORT=9010` и
**без единой строки `SMTP_`**; `npx medusa develop`; затем `apps/storefront/.env.local`
с `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9010` и ключом тенанта `acme`
(`pk_91071ed6…`), `npx next dev -p 8010`, открыть
`http://localhost:8010/ru/order/order_01M2HE84NFRF0ADR2J746QPFNE/confirmed`.
