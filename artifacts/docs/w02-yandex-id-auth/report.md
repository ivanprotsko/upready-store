# w02-yandex-id-auth — вход через Яндекс ID для покупателей витрины

Отчёт написан 2026-09-16 04:50 WITA. Ветка `feat/day16-yandex-id-auth`, база `dev` (`c20d8b40`).
Живьём проверено на локальном стенде: бэкенд `:9042`, витрина `:3101`, БД `upready_store_w02`
на `127.0.0.1:5433`. Оба сервера после замеров остановлены.

## Главный результат

**Вход работает целиком, от кнопки до личного кабинета.** Покупатель нажимает «Войти через Яндекс ID»,
проходит экран согласия Яндекса и возвращается на `/ru/account` уже авторизованным — с именем и почтой
из Яндекса. Проверено вживую дважды, оба раза с личного аккаунта из `# WEB`.

И попутно выяснилось главное неизвестное задачи: **Redirect URI и права в приложении Яндекса УЖЕ
зарегистрированы**, файла `blocked-*.md` нет. Экран согласия (скриншот 02) прямо перечисляет, что
приложение получает: «Доступ к адресу электронной почты» (`login:email`) и «Доступ к логину, имени и
фамилии, полу» (`login:info`). Доступа к аватару нет — поле `picture` у личности поэтому пустое, и
это нормально.

## Что сделано

### 1. Провайдер `yandex` в auth-модуле Medusa
`apps/backend/src/modules/auth-yandex/` — `services/yandex.ts` (сам провайдер на
`AbstractAuthModuleProvider`), `lib/oauth.ts` (чистые помощники: URL согласия, обмен кода, профиль),
`lib/state.ts` (подписанный `state`). Зарегистрирован в `apps/backend/medusa-config.ts` рядом с
`emailpass`.

Три вещи, на которых легко было сломаться, и как они решены:

- **Объявление auth-модуля ЗАМЕНЯЕТ дефолтную регистрацию Medusa.** `resolveModules`
  в `@medusajs/utils/dist/common/define-config.js` добавляет модуль со списком
  `providers: [emailpass]`, а `transformModules` ключует модули по имени сервиса, где побеждает
  последний. Значит список в нашем конфиге — это весь список: убрать оттуда `emailpass` = положить
  сразу и вход по паролю на витрине, и вход владельца в панель. `emailpass` выписан явно, и на это
  есть отдельный тест в HTTP-сюите.
- **Яндекс не выдаёт `id_token`** (в отличие от Google) — проверять против JWKS нечего. Токен
  непрозрачный, личность доказывает серверный запрос профиля на `https://login.yandex.ru/info`,
  и там схема `Authorization: OAuth <token>`, а НЕ `Bearer`.
- **`state` подписан, а не сохранён.** Штатный `setState`/`getState` кладёт состояние в кэш-модуль,
  который без `REDIS_URL` живёт в памяти процесса, и не умеет нести тенанта, язык и страницу
  возврата. Здесь `state` — это сам payload, подписанный HMAC-SHA256 на `JWT_SECRET`, срок жизни
  10 минут (столько же живёт код Яндекса). Подпись сама по себе не защита от CSRF, поэтому витрина
  кладёт `nonce` из `state` в httpOnly-куку и колбэк отвергает `state` с другим `nonce`.

Провайдер регистрируется ТОЛЬКО при непустом `YANDEX_CLIENT_ID` — той же формы, что Redis, SMTP и S3
в этом же конфиге. Установка без ключей Яндекса грузится ровно как раньше; включение — правка `.env`,
не кода. А наполовину заполненный блок (id есть, секрета нет) падает на старте с именем недостающей
переменной, а не на экране согласия у покупателя.

### 2. Связывание с уже существующим аккаунтом
`apps/backend/src/api/store/customers/oauth-link/route.ts` + запись в `src/api/middlewares.ts`.

Зачем: `POST /store/customers` отказывает, если на этой почте уже есть аккаунт (шаг
`validate-customer-account-creation` в `@medusajs/medusa/core-flows` бросает DUPLICATE_ERROR при
`has_account = true`). Без этого маршрута покупатель, зарегистрированный по паролю, на кнопке
«Войти через Яндекс» услышал бы, что его собственный адрес занят.

Почему это безопасно: почта НИКОГДА не берётся из запроса — она читается с provider-личности, куда её
записал провайдер по серверному запросу к login.yandex.ru, то есть браузер выбрать её не может.
Маршрут не создаёт покупателей и не перепривязывает личность, у которой аккаунт уже есть; гостевая
строка (`has_account: false`) целью связывания не является — гостевые заказы забирает
`/store/customers/me/claim-orders`.

### 3. Витрина
- Кнопка «Войти через Яндекс ID» —
  `apps/storefront/src/modules/account/components/yandex-login/` (ссылка, а не кнопка с обработчиком:
  первый шаг работает без клиентского JS). Рендерится только при
  `NEXT_PUBLIC_YANDEX_LOGIN_ENABLED=true`. Бренд-знак вынесен в `yandex-mark.tsx` отдельным файлом,
  чтобы замена на официальный ассет ничего больше не трогала.
- Маршруты `src/app/api/yandex-login/` и `src/app/api/yandex-callback/`.
- Строки на всех 36 языках (9 ключей × 36 каталогов), проверка паритета из AGENTS.md — чисто.
- Экран оформления заказа отдельного изменения не потребовал: `sign-in-prompt` — это ссылка на
  `/account`, так что кнопка доезжает туда сама.

### 4. Тесты
- `apps/backend/src/modules/auth-yandex/__tests__/` — 3 файла, 33 теста.
- `apps/backend/integration-tests/http/auth-yandex.spec.ts` — 11 тестов через живой HTTP.
- `apps/storefront/tests/stands/yandex-login.pw.ts` — браузерный шаг до экрана согласия.
- `docs/auth-yandex.md` — как это устроено, что нужно в приложении Яндекса, как включить и проверить.

## Замеры

### Тесты

```
$ pnpm test:unit                               (apps/backend)
Test Suites: 39 passed, 39 total
Tests:       418 passed, 418 total

$ pnpm test:unit -- src/modules/auth-yandex
Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total

$ pnpm test:integration:http -- integration-tests/http/auth-yandex.spec.ts
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

Вся HTTP-сюита (29 файлов) прогнана в два захода — одним заходом процесс jest падает по памяти
(`FATAL ERROR: Ineffective mark-compacts near heap limit`, 19 файлов из 29; это ограничение машины,
на ней Node 26.8.1 при `engines` репозитория ^20/^22, а не код задачи):

```
заход 1 (19 файлов): 18 PASS, 1 FAIL — tenants-orders-detail.spec.ts
заход 2 (10 файлов, --max-old-space-size=8192): 10 PASS, 73 теста
```

**Про единственный FAIL.** `tenants-orders-detail.spec.ts › keeps the order-detail reference lists
tenant-safe` падает на списке складских локаций (`/tenants/stock-locations` вернул другой `sloc_…`),
к авторизации отношения не имеет. Проверено, а не предположено: я временно вернул
`medusa-config.ts` и `src/api/middlewares.ts` к состоянию базы (`git checkout c20d8b40 -- …`) и
прогнал этот файл отдельно — **падает точно так же, 1 failed / 6 passed**. То есть дефект стоит на
`dev` до этой задачи. Затем изменения возвращены (`git checkout HEAD -- …`), дерево чистое.

### Проверки сборки и стиля

```
apps/backend:  npx tsc --noEmit        → rc=0
apps/backend:  npx medusa lint         → rc=0, 75 warning (все — в файлах, которых задача не трогает;
                                          grep по auth-yandex/oauth-link в логе линта = 0 строк)
pnpm check:backend-build               → Backend build completed successfully (13.43s)
apps/storefront: npx tsc --noEmit      → rc=0
apps/storefront: npx next lint         → rc=0 (1 предупреждение в yandex-metrica, было до задачи)
apps/storefront: npx next build        → ✓ Compiled successfully; в таблице маршрутов
                                          ƒ /api/yandex-callback и ƒ /api/yandex-login
node scripts/check-locale-catalogs.mjs — не запускался: список локалей не менялся
проверка паритета каталогов из AGENTS.md → checked 36 catalogs against 491 keys, расхождений нет
```

### Живой стенд, шаг 1 — бэкенд отдаёт адрес экрана согласия

```
$ curl -sS -X POST http://127.0.0.1:9042/auth/customer/yandex \
    -H 'content-type: application/json' \
    -d '{"callback_url":"http://localhost:3101/api/yandex-callback","tenant":"cherkashino",
         "locale":"ru","return_to":"/ru/account","nonce":"demo-nonce"}'

host:          https://oauth.yandex.ru/authorize
response_type: code
client_id:     <YANDEX_CLIENT_ID>          (в отчёт не выписывается)
redirect_uri:  http://localhost:3101/api/yandex-callback
force_confirm: yes
state:         две части через точку; payload =
  {"cb":"http://localhost:3101/api/yandex-callback","tn":"cherkashino","lc":"ru",
   "rt":"/ru/account","n":"demo-nonce","exp":1789505278}
```

### Живой стенд, шаг 2 — кнопка на странице и первый шаг флоу

```
$ curl -s http://localhost:3101/ru/account | grep …
data-testid="yandex-login-cta"
Войти через Яндекс ID
href="/api/yandex-login?return=%2Fru%2Faccount"

$ curl -sS -D - -o /dev/null "http://localhost:3101/api/yandex-login?return=%2Fru%2Faccount"
HTTP/1.1 307 Temporary Redirect
location: https://oauth.yandex.ru/authorize?response_type=code&client_id=<YANDEX_CLIENT_ID>
          &redirect_uri=http%3A%2F%2Flocalhost%3A3101%2Fapi%2Fyandex-callback&state=…&force_confirm=yes
set-cookie: _yandex_return=%2Fru%2Faccount; Path=/; Max-Age=600; HttpOnly; SameSite=lax
set-cookie: _yandex_nonce=cd2459cb…; Path=/; Max-Age=600; HttpOnly; SameSite=lax
```

### Живой стенд, шаг 3 — все отказы колбэка

```
A. без кук вообще            → /en/account?yandex_error=expired
B. ?error=access_denied      → /en/account?yandex_error=denied
C1. nonce совпал, код мусорный → /ru/account?yandex_error=rejected
    (в логе бэкенда: [auth-yandex] callback failed: Yandex token exchange failed: Invalid code,
     GET /auth/customer/yandex/callback … (401))
C2. те же куки, но state, выписанный ДРУГОМУ браузеру → /ru/account?yandex_error=expired
```

C2 — это и есть защита от CSRF в работе: подписанный `state` сам по себе получить нетрудно, а вот
совпасть с `nonce` в httpOnly-куке чужого браузера нельзя.

Все семь кодов ошибок рендерятся своим текстом (замер после исправления, см. «Что нашлось по дороге»):

```
denied        Вы отменили вход на странице Яндекса.
expired       Ссылка для входа устарела. Начните заново.
rejected      Яндекс не подтвердил этот вход. Попробуйте ещё раз.
email_taken   Аккаунт с этой почтой уже есть. Войдите по паролю.
no_email      Яндекс не передал адрес почты, поэтому аккаунт создать нельзя.
unconfigured  Вход через Яндекс в этом магазине пока не включён.
failed        Войти не получилось. Попробуйте через минуту.
неизвестный код → Войти не получилось. Попробуйте через минуту.
/en/…&denied    → You cancelled the sign-in on the Yandex page.
```

### Живой стенд, шаг 4 — полный вход в браузере (Playwright, аккаунт из `# WEB`)

Заход 1 — новый покупатель:

```
экран согласия: https://oauth.yandex.ru/authorize
  «Сервис «Черкашино» получит доступы:
     Доступ к адресу электронной почты
     Доступ к логину, имени и фамилии, полу»
после «Войти»: http://localhost:3101/ru/account
страница: «Привет, Оксана» — то есть личный кабинет, а не форма входа
```

В базе:

```sql
select pi.provider, pi.user_metadata->>'name', ai.app_metadata->>'customer_id' …
 provider | email_masked   | name             | has_avatar | customer_id
 yandex   | c***@yandex.ru | Оксана Черкашина | f          | cus_01M2KD0YYDAJEVPDEB2QKBFFCE

select … from customer where id = 'cus_01M2KD0YYDAJEVPDEB2QKBFFCE';
 email_masked   | first_name | last_name  | has_account | metadata
 c***@yandex.ru | Оксана     | Черкашина  | t           | {"locale":"ru","yandex_login":"Cherkashino-67"}
```

Заход 2 — тот же человек, но аккаунт на этой почте уже был заведён по паролю (проверка связывания).
Перед заходом: созданный Яндексом покупатель удалён, личность отвязана, и на ту же почту
зарегистрирован обычный `emailpass`-аккаунт «Оксана Пароль». После входа через Яндекс:

```sql
select count(*) from customer where email = <та же почта>;      →  1   (дубля нет)

 id                             | first_name | last_name | linked_to                      | providers
 cus_01M2KD2NRRJ90K9YRJ8V30F287 | Оксана     | Пароль    | cus_01M2KD2NRRJ90K9YRJ8V30F287 | yandex
```

Личность Яндекса привязана к СУЩЕСТВУЮЩЕМУ аккаунту, второй покупатель не создан — ровно то,
что требовалось.

### Скриншоты

- `artifacts/docs/w02-yandex-id-auth/01-login-page.png` — страница входа с кнопкой
- `artifacts/docs/w02-yandex-id-auth/02-yandex-consent.png` — экран согласия Яндекса со списком прав
- `artifacts/docs/w02-yandex-id-auth/03-account-after-yandex-login.png` — личный кабинет после входа
- `artifacts/docs/w02-yandex-id-auth/04-login-error-denied.png` — отказ на экране согласия, как его видит покупатель

Абсолютные пути — `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-yandex-id-auth/artifacts/docs/w02-yandex-id-auth/`.
На двух снимках логин тестового аккаунта закрашен: он существует только ради этой проверки и в
артефакты не выписывается. Исходные кадры с открытым логином удалены.

### Секреты в дерево не попали

```
$ git grep -n -e "$YANDEX_CLIENT_ID" -- .            → rc=1 (не найдено)
$ git grep для секрета, логина и пароля              → не найдено ни одного
$ git log -p c20d8b40..HEAD | grep -c <все четыре>   → 0
$ git status --porcelain | grep -c "\.env"           → 0
```

`apps/backend/.env` и `apps/storefront/.env` стенда — под `.gitignore` (`apps/backend/.gitignore:2`,
`.gitignore:37`), ключи Яндекса в них не записаны вовсе: они подставляются в окружение через
`set -a; source …/.env.cherkashino; set +a` перед запуском.

## Что нашлось по дороге и исправлено

**Сообщения об ошибке входа не доезжали до экрана.** Первая версия отдавала текст в
`@modules/checkout/components/error-message`, а тот прогоняет что угодно через `useErrorMessage` →
`resolveErrorKey`, то есть ищет строку в каталоге `Errors` и для незнакомой подставляет общее
«Что-то пошло не так». Замер на стенде: все семь кодов рендерили одну и ту же общую фразу вместо
своей. Исправлено коммитом `bf27d6e6` — уже переведённый текст выводится напрямую, в той же
стилистике. Тот компонент предназначен для СЫРЫХ строк бэкенда, и это теперь написано рядом.

## Чего НЕ сделано и почему

- **Кнопка в фирменном виде Яндекса.** Яндекс просит свой знак и цвет. Сейчас в
  `yandex-mark.tsx` — заглушка в языке магазина (красный квадрат с «Я»), вынесенная отдельным
  файлом. Замена на официальный ассет — дизайнерский шаг, а не кодовый.
- **Приложение Яндекса не верифицировано.** На экране согласия висит «Сервис ещё не верифицирован ·
  Входите с Яндекс ID, только если доверяете сервису». Для боевого магазина это стоит закрыть —
  вопрос к Ивану, действие в кабинете Яндекса.
- **Витринный стенд-тест (`tests/stands/yandex-login.pw.ts`) не прогонялся своей командой.**
  `pnpm test:stands` запускает Playwright в docker-образе, а локальный docker на этой машине
  запрещён приказом Ивана. Сам браузерный шаг при этом ПРОВЕРЕН — тем же Playwright, но нативно,
  скриптом против стенда `:3101` (см. шаг 4). Кстати, комментарий в
  `tests/stands/playwright.config.ts` утверждает, что «браузер не стартует из агентской оболочки на
  macOS»; сегодня стартует — chromium запустился нативно и отработал весь флоу.
- **Вход владельца в панель через Яндекс** — не в этой задаче; провайдер к этому готов, нужен только
  actor type `tenant` в `authMethodsPerActor` и кнопка в панели.
- **Покупатель на этой платформе — строка на весь магазин.** Связи тенант↔покупатель в схеме нет
  (`src/api/tenants/customers/helpers.ts`: магазин владеет покупателем ровно тогда, когда его
  называет заказ этого магазина). Поэтому `oauth-link` ищет аккаунт по почте по всему магазину —
  ровно так же, как это уже делает вход по паролю. Сузить до одного тенанта можно только после того,
  как такая связь появится.

## Развилка для Ивана: один колбэк на хост или один на платформу

Сейчас Redirect URI регистрируется по одному на каждый хост витрины, путь всегда
`/api/yandex-callback`. Так сделано потому, что куку сессии `_medusa_jwt` может поставить только тот
origin, на котором стоит покупатель, — то есть колбэк обязан жить на витрине. Цена: на каждый новый
магазин платформы в приложении Яндекса руками добавляется строка
`https://<handle>.shipshift.dev/api/yandex-callback`, плюс каждый свой домен магазина.

Альтернатива — один колбэк на `shipshift.dev`, который читает тенанта из подписанного `state` и
пересылает покупателя на origin его магазина с одноразовым тикетом: одна регистрация на всю
платформу, ценой лишнего редиректа и обмена тикетом, которого пока никто не написал. Разумно
переезжать тогда, когда магазинов станет больше, чем хочется регистрировать руками. Подробности —
в `docs/auth-yandex.md`.

Заодно: путь `/api/yandex-callback` выбран вместо предложенного в задании
`/ru/account/yandex/callback` именно потому, что Яндекс сверяет `redirect_uri` посимвольно, и
локаль в пути означала бы 36 регистраций на каждый хост вместо одной. Язык и страница возврата едут
внутри подписанного `state`.

## Как приёмщику проверить это за 10 минут

1. `git log --oneline c20d8b40..HEAD` — четыре коммита, 57 файлов.
2. Юниты: `cd apps/backend && corepack pnpm test:unit -- src/modules/auth-yandex` → 33 passed.
3. HTTP: поднять переменные Яндекса в окружение и
   `corepack pnpm test:integration:http -- integration-tests/http/auth-yandex.spec.ts` → 11 passed.
   (без переменных провайдер не регистрируется, и первый же тест об этом честно скажет).
4. Глазами: четыре скриншота выше. Второй — главный: на нём видно, какие права реально выданы
   приложению.
5. Если хочется своими руками — рецепт стенда в `docs/auth-yandex.md`, раздел «Checking it»:
   поднять бэкенд и витрину на `:3101`, открыть `http://localhost:3101/ru/account`.
   Адрес `http://localhost:3101/api/yandex-callback` в приложении Яндекса уже зарегистрирован.
