# f03-guest-order-not-in-account — заказ гостя в кабинете при регистрации с тем же e-mail

Отчёт написан 2026-09-15 11:43 WITA. Ветка `fix/day16-guest-order-claim`, база `dev`.
## Что сделано

Покупатель, оформивший заказ гостем и зарегистрировавшийся потом на **тот же** e-mail, видит этот заказ в кабинете. Раньше кабинет был пуст, а единственный выход, который предлагал экран, — вставить ссылку из письма, которого на этом стеке никто не отправляет (родственная задача f02).

### Почему так, а не иначе (разбор по коду)

- Гостевой чекаут в Medusa 2.19 вешает заказ на покупателя с `has_account: false` (его создаёт `findOrCreateCustomerStep` при завершении корзины). Регистрация создаёт **второго** покупателя — `createCustomerAccountWorkflow` просто зовёт `createCustomersWorkflow` с `has_account: true` и ничего не ищет по адресу (`core-flows/dist/customer/workflows/create-customer-account.js`).
- `GET /store/orders` фильтрует **только** по `customer_id` (`@medusajs/medusa/dist/api/store/orders/route.js`), поэтому заказ гостя в новом аккаунте невидим. Это и есть репортнутый дефект.
- Родной перенос (`requestOrderTransferWorkflow`) выписывает токен и шлёт его письмом на адрес **заказа**, а покупатель должен кликнуть ссылку. Этот круг доказывает владение почтовым ящиком — и он уместен, когда заказ оформлен на **другой** адрес, не на адрес аккаунта. Когда адрес заказа и адрес аккаунта — одна и та же строка, письмо не устанавливает ничего сверх того, что устанавливает сам запрос; а на этом деплое оно вдобавок не уходит вовсе.

Отсюда выбран **оба** варианта из постановки, с разделением ролей:

1. **Привязка по адресу, без письма** — новый маршрут `POST /store/customers/me/claim-orders`. Витрина зовёт его сама сразу после регистрации и сразу после входа, плюс на экране «Заказы» есть кнопка «Найти мои заказы», которая делает то же самое руками.
2. **Перенос по ссылке из письма оставлен как был** — он ниже на экране и отвечает за случай «заказ оформлен на другой адрес», где ссылка действительно единственное доказательство.

Вход обрабатывается наравне с регистрацией намеренно: самый частый путь к пустому кабинету — не «зарегистрировался после заказа», а «оформил заказ, не заметив, что разлогинен», и он лечится только привязкой при входе.

## Изменённые файлы

Бэкенд:

| Файл | Что в нём |
|---|---|
| `apps/backend/src/guest-order-claim/select-claimable-orders.ts` | чистое решение «какие заказы можно отдать этому аккаунту» — шесть правил, каждое про то, кому заказ отдавать **нельзя** |
| `apps/backend/src/guest-order-claim/__tests__/select-claimable-orders.unit.spec.ts` | 16 unit-проверок этих правил |
| `apps/backend/src/workflows/customer/claim-guest-orders/index.ts` | воркфлоу `claim-guest-orders` (чтобы seam-тест и будущий бэкфилл звали ту же единицу) |
| `apps/backend/src/workflows/customer/claim-guest-orders/steps/claim-guest-orders.ts` | шаг: читает адрес **из строки аккаунта**, выбирает заказы, переписывает `customer_id`, компенсация возвращает прежних владельцев |
| `apps/backend/src/api/store/customers/me/claim-orders/route.ts` | маршрут; тела у запроса нет вовсе |
| `apps/backend/src/api/middlewares.ts` | регистрация маршрута с `authenticate("customer", …)` |
| `apps/backend/integration-tests/http/guest-order-claim.spec.ts` | seam-тест: счастливый путь + четыре негатива |

Витрина:

| Файл | Что в нём |
|---|---|
| `apps/storefront/src/lib/data/orders.ts` | `claimGuestOrders()` и форм-экшен `claimGuestOrdersAction` |
| `apps/storefront/src/lib/data/customer.ts` | вызов привязки после `signup` и после `login`; падение привязки не ломает вход, но пишется в лог |
| `apps/storefront/src/modules/account/components/claim-orders-form/index.tsx` | блок «Оформляли заказ без регистрации?» с кнопкой |
| `apps/storefront/src/app/[locale]/(main)/account/@dashboard/orders/page.tsx` | блок привязки первым, форма переноса по ссылке под ним |
| `apps/storefront/messages/*.json` (36 файлов) | секция `ClaimOrders`, 6 ключей, переведены на все 36 языков (не копии английского) |

## Кому заказ не отдаётся

Правила живут в `select-claimable-orders.ts` и применяются **поверх** SQL-фильтра, а не вместо него (`$ilike` считает `_` и `%` в адресе шаблоном, поэтому выборка может вернуть лишнее — точное сравнение делает JS):

1. адрес заказа ≠ адрес аккаунта (сравнение без регистра и без пробелов по краям);
2. заказ оформлен в канале продаж **другого** магазина (канал берётся из publishable-ключа витрины, а не из запроса);
3. заказ уже принадлежит этому аккаунту (двигать нечего);
4. заказ уже принадлежит **зарегистрированному** аккаунту — такой не отбирается никогда, для него и существует перенос по письму;
5. черновик заказа (документ владельца, не покупателя);
6. отменённый заказ.

Адрес и магазин в запрос не передаются: адрес читается из строки покупателя за токеном сессии, магазин — из publishable-ключа. Расширить область запросом нечем.

## Как мерялось (правило 18f)

Стенд — локальный, **несёт тенанта `cherkashino`** (каталог Оксаны, 113 товаров): бэкенд `medusa develop` на `:9077`, витрина `next dev` на `:8077`, БД `upready_store_f03` — клон `upready_store_cherkashina` на `127.0.0.1:5433`, догнанный `medusa db:migrate` (клон отставал: `relation "tenant_locale_settings" does not exist`). Магазин открывается как `http://cherkashino.localhost:8077/ru`; тенант резолвится по хосту:

```
curl -s "http://localhost:9077/storefront/by-host?host=cherkashino.localhost"
→ {"tenant":{"id":"ten_01M29Q4KYQHC70JZBENWZ8Z88M","handle":"cherkashino","name":"Оксана Черкашина"}, …}
```

Живой магазин `cherkashino.shipshift.dev` я не трогал: деплой в задаче не прописан.

Весь путь покупателя прогонялся браузером (Playwright, настоящие клики по витрине), а не запросами в обход экрана.

### Пункты приёмки

Все замеры ниже — один прогон от 2026-09-15, адрес покупателя `qa-f03-final-113608@upready.test`, пароль аккаунта `upready-f03-2026`.

**1. Гостевой заказ, потом регистрация на тот же адрес.** Заказ №19 `order_01M2HJ7HNGVS9K0ZC008PJJ1Y2` оформлен браузером через витрину, без входа в аккаунт. Состояние сразу после оформления:

```sql
select o.display_id, o.email, o.customer_id, c.has_account from "order" o
  join customer c on c.id = o.customer_id where o.id = 'order_01M2HJ7HNGVS9K0ZC008PJJ1Y2';
→ 19 | qa-f03-final-113608@upready.test | cus_01M2HJ6R8SMR6ASE2RN44HCNBV | f     ← гость
```

После регистрации на тот же адрес (форма «Присоединиться» на `/ru/account`):

```
→ 19 | qa-f03-final-113608@upready.test | cus_01M2HJ9CGSDZBSABGZVR8R5D5T | t     ← аккаунт

select id, has_account from customer where email = 'qa-f03-final-113608@upready.test';
→ cus_01M2HJ6R8SMR6ASE2RN44HCNBV | f      ← гостевая строка осталась, она и должна остаться
→ cus_01M2HJ9CGSDZBSABGZVR8R5D5T | t
```

**2. `/ru/account/orders` показывает заказ с номером, датой и суммой.** Кнопку жать не пришлось — привязка отработала на регистрации:

```
» order cards: 1
» first card: Заказ №19 | Не собран | Авторизован | 15 сент. 2026 г. | 1 084,00 ₽ | 1 товар |
              Оксана Черкашина pickup · 0,00 ₽ | Зубная паста тайская отбеливающая×1 | Подробнее
» mobile order cards: 1
```

Скриншоты (PNG вне git, как и весь `artifacts/` в этом репозитории):
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-guest-order-claim/artifacts/docs/f03-guest-order-not-in-account/01-account-orders-1280x900.png` (1280×900)
- `…/02-account-orders-390x844.png` (390×844)

**3. Открытый заказ показывает состав, способ доставки и адрес** — `/ru/account/orders/details/order_01M2HJ7HNGVS9K0ZC008PJJ1Y2`, скриншот `…/03-order-detail-1280x900.png`:

```
Заказ №19 | Дата заказа: 15 сентября 2026 г. | Не собран | Авторизован
Товары: Зубная паста тайская отбеливающая | Вариант: …, 50 гр | 1x | 1 084,00 ₽
Итого 1 084,00 ₽
Доставка: Адрес — Иван Тестовый, ул. Тестовая, д. 1, кв. 2, RU | Контакт +79990000001, qa-f03-final-113608@upready.test
Метод: Оксана Черкашина pickup · 0,00 ₽
Оплата: Оплата вручную, 1 084,00 ₽ оплачено 15 сент. 2026 г., 11:37
```

**4. Второй аккаунт с ДРУГИМ адресом заказ не видит.** Зарегистрирован `qa-f03-stranger-113754@upready.test`, экран пуст, нажатие «Найти мои заказы» отвечает честным нулём, а не молчанием:

```
» stranger order cards: 0
» stranger empty block: 1
» stranger claim result: Заказов без аккаунта на вашу почту в этом магазине не нашлось.
» stranger order cards after claim: 0
```

Скриншот `…/04-stranger-account-orders-1280x900.png`.

То же самое напрямую по API (`upready-f03-2026` — пароль обоих тестовых аккаунтов):

```
A. владелец адреса, свой магазин, ПОВТОРНЫЙ вызов (идемпотентность):
   POST /store/customers/me/claim-orders → {"claimed":0,"orders":[]}
B. ЧУЖОЙ аккаунт (qa-f03-stranger-113754@upready.test), тот же магазин:
   POST /store/customers/me/claim-orders → {"claimed":0,"orders":[]}
B2. GET /store/orders этого же аккаунта → {'count': 0, 'orders': []}
C. тот же (правильный) адрес, но ключ ДРУГОГО магазина (acme):
   POST /store/customers/me/claim-orders → {"claimed":0,"orders":[]}
D. без покупателя за вызовом: HTTP 401
E. GET /store/orders владельца адреса → {'count': 1, 'orders': [('order_01M2HJ7HNGVS9K0ZC008PJJ1Y2', 19)]}
```

Пятый негатив — «заказ, уже принадлежащий зарегистрированному аккаунту, не отбирается» — проверяется seam-тестом (`never takes an order away from the registered account that owns it`): создаётся заказ с чужим адресом в почте, но с `customer_id` другого аккаунта, и регистрация на этот адрес даёт `claimed: 0`, а владелец продолжает его видеть.

**Отдельно: вход, а не только регистрация.** Самый частый путь к пустому кабинету — покупка «не заметив, что разлогинен». Заказ №20 `order_01M2HJEZ0E5B0ZQ054HJYH87B7` оформлен гостем на адрес, у которого аккаунт уже был:

```
До входа:  20 | cus_01M2HJ6R8SMR6ASE2RN44HCNBV | f     ← снова гостевая строка
```
```
После входа на витрине (форма «Войти» на /ru/account):
» order cards after login: 2
» card 1: Заказ №20 | Не собран | Авторизован | 15 сент. 2026 г. | 1 084,00 ₽ | 1 товар | Оксана Черкашина pickup · 0,00 ₽
» card 2: Заказ №19 | …
```

Скриншот `…/05-after-login-claim-1280x900.png`.

**5. Тестовые заказы отменены** — `POST /tenants/orders/<id>/cancel` токеном владельца магазина:

```
order_01M2HJ7HNGVS9K0ZC008PJJ1Y2 HTTP 200 status=canceled
order_01M2HJEZ0E5B0ZQ054HJYH87B7 HTTP 200 status=canceled

select display_id, status, email from "order" where email like 'qa-f03%' order by display_id;
→ 17 | canceled | qa-f03-111104@upready.test        (заказы первого, отладочного прогона)
→ 18 | canceled | qa-f03-111104@upready.test
→ 19 | canceled | qa-f03-final-113608@upready.test  (финальный прогон)
→ 20 | canceled | qa-f03-final-113608@upready.test
```

Все четыре живут **только** в моей одноразовой БД `upready_store_f03` (клон, заведён под эту задачу). На живом магазине Оксаны не создано ничего.

## Проверки

Ставил зависимости `corepack pnpm install --frozen-lockfile` (pnpm 10.11.1 из `packageManager`). Первый заход я поставил их `pnpm` 8.12.0 с PATH — он **понизил `pnpm-lock.yaml` с v9.0 до v6.0**; лок я вернул `git checkout --`, дерево переставил правильным pnpm и **все проверки и замеры ниже прогнаны заново** на нём. В диффе PR лок-файла нет.

| Проверка | Команда | Результат |
|---|---|---|
| Типы бэкенда | `cd apps/backend && npx tsc --noEmit` | `rc=0` |
| Линт бэкенда | `cd apps/backend && npx medusa lint` | `rc=0`, 52 предупреждения — все в чужих файлах, в моих ноль (`medusa develop` на ошибке линта не стартует, поэтому это не формальность) |
| Unit бэкенда | `TEST_TYPE=unit … npx jest` | `Tests: 1 failed, 206 passed, 207 total` — упавший `src/migration-scripts/__tests__/profile-data.unit.spec.ts › i18n merge` **мой дифф не трогает**; он падает и на `dev` в основном чекауте (`Tests: 1 failed, 14 passed, 15 total`), проверял отдельно. Мои 16 проверок `select-claimable-orders` зелёные |
| Seam | `TEST_TYPE=integration:http … guest-order-claim.spec.ts` | `Test Suites: 1 passed`, `Tests: 6 passed, 6 total` |
| Типы витрины | `cd apps/storefront && npx tsc --noEmit` | `rc=0` |
| Линт витрины | `npx next lint` | `✔ No ESLint warnings or errors` |
| Сборка витрины | `npx next build` | `✓ Compiled successfully`, `✓ Generating static pages (18/18)`, таблица маршрутов напечатана |
| Паритет 36 каталогов | скрипт из `AGENTS.md` | `checked 36 catalogs against 476 keys`, расхождений нет |

## Что этот выбор стоит — риск называю прямо

Регистрация на этом стеке **не подтверждает e-mail**: `POST /auth/customer/emailpass/register` заводит личность по паре «адрес + пароль» и ничего на адрес не проверяет. Значит, после этого изменения тот, кто знает адрес покупателя, может завести на него аккаунт и увидеть его заказы — состав, адрес доставки, телефон. До изменения ему для этого нужен был доступ к почтовому ящику (токен переноса приходил письмом).

Я считаю размен оправданным здесь и сейчас: письма у магазина нет вообще (f02), то есть «защита ящиком» сегодня не защищает, а просто закрывает покупателю выход, и каждый гость пишет Оксане в Telegram. Но размен — настоящий, и закрывать его надо подтверждением адреса при регистрации. **Предлагаю завести отдельную задачу**: письмо с кодом/ссылкой подтверждения при регистрации, и до подтверждения — не отдавать чужие гостевые заказы (привязку ставить в очередь до подтверждения). Это следующий слой, не этот PR.

## Смежная находка (НЕ чинил — вне рамок задачи)

`GET /store/orders` не ограничен тенантом: ядровой маршрут фильтрует только по `customer_id`. Аккаунт покупателя на этом стеке общий для всех магазинов платформы, поэтому заказы одного магазина видны в кабинете другого. Замер на стенде (аккаунт с заказами магазина `cherkashino`, ключ магазина `acme`):

```
curl -s "http://localhost:9077/store/orders?limit=10&fields=id,display_id" \
  -H "x-publishable-api-key: <ключ acme>" -H "authorization: Bearer <токен покупателя>"
→ {'count': 2, 'orders': [('order_01M2HGS7QY1RF6R5R5V1ERDAFW', 17), ('order_01M2HHKXM0AKCZAFDTXHNP572F', 18)]}
```

Это дефект платформы, а не моего изменения (привязка у меня как раз ограничена магазином — см. негатив C ниже), и он про **свои же** заказы покупателя, а не про чужие. Но экран, который я чинил, — тот же самый, поэтому называю: нужна отдельная задача «/store/orders ограничить каналом продаж publishable-ключа», с проверкой, что заказы без `sales_channel_id` при этом не исчезают из кабинета.

## Что НЕ сделано и почему

- **Письма покупателю не чинил** — это f02 (`Could not find a notification provider for channel: email`). Мой блок делает так, что письмо перестаёт быть единственной дорогой, но письмо всё равно нужно.
- **На живой магазин не выкатывал.** Деплой в задаче не прописан, а в брифе прямо сказано не деплоить без указания. Изменение живёт в ветке; на `cherkashino.shipshift.dev` его нет.
- **Подтверждение e-mail при регистрации** — см. раздел про риск, отдельная задача.
- **`/store/orders` не ограничил тенантом** — см. смежную находку, отдельная задача.
- **Медленный путь «после привязки заказ появляется без перезагрузки»** держится на том, что серверный экшен Next перерисовывает маршрут. Отдельного `router.refresh()` я не ставил намеренно (правило 19h: лишний refresh уносит состояние, открытое в этот момент).

## Как приёмщику проверить за 10 минут

Стенд поднимается из этой ветки; БД — клон, который можно сделать заново одной командой.

```bash
cd <worktree>                      # ветка fix/day16-guest-order-claim
corepack pnpm install --frozen-lockfile        # именно corepack: pnpm 8 на PATH понижает лок до v6

/opt/homebrew/opt/libpq/bin/psql -h localhost -p 5433 -U ivanprotsko -d postgres \
  -c "CREATE DATABASE upready_store_f03 TEMPLATE upready_store_cherkashina"

cat > apps/backend/.env <<'EOF'
STORE_CORS=http://localhost:8077,http://cherkashino.localhost:8077
AUTH_CORS=http://localhost:8077,http://cherkashino.localhost:8077
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
DB_NAME=upready_store_f03
DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_f03
PORT=9077
STOREFRONT_URL=http://localhost:8077
STOREFRONT_SETTINGS_SECRET=supersecret
STOREFRONT_DEFAULT_LOCALE=ru
EOF
cat > apps/storefront/.env.local <<'EOF'
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9077
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
DEMO_HOSTS=localhost
STOREFRONT_SETTINGS_SECRET=supersecret
EOF

(cd apps/backend && npx medusa db:migrate)      # клон отстаёт от dev по схеме
(cd apps/backend && npx medusa develop &)
(cd apps/storefront && npx next dev -p 8077 &)
```

Дальше руками, 5 минут: открыть `http://cherkashino.localhost:8077/ru`, купить что угодно **не входя в аккаунт** (оплата «вручную», карта `4242 4242 4242 4242`, `12/30`, `123`), затем на `/ru/account` нажать «Присоединиться» и зарегистрироваться **на тот же адрес**. Экран `/ru/account/orders` обязан показать заказ сразу, без нажатия кнопки. Потом зарегистрировать второй аккаунт на **другой** адрес, нажать «Найти мои заказы» — должно ответить «Заказов без аккаунта на вашу почту в этом магазине не нашлось» и список остаться пустым.

Быстрее без браузера — seam-тест, он проверяет то же самое и все четыре негатива:

```bash
cd apps/backend
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko DB_PASSWORD= PORT=9078 DATABASE_URL= \
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules \
npx jest --silent=false --runInBand --forceExit integration-tests/http/guest-order-claim.spec.ts
```

## Коммиты

- `905fa6f feat(account): гостевой заказ привязывается к аккаунту с тем же e-mail (f03-guest-order-not-in-account)`
- `e931724 test(store): seam-тест привязки гостевых заказов и четыре негатива (f03-guest-order-not-in-account)`

## Мелочь, которую видно на скриншотах

Картинки товаров на стенде битые (`GET /_next/image?url=http://localhost:9033/static/tenants/…` → 500): в БД-клоне у медиа зашит порт **прежнего** стенда `:9033`. Это свойство клона, а не изменения; на живом магазине URL медиа другие.
