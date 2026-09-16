# p01-settings-integrations-restructure — «Подключение» = /settings/integrations/<сервис>

Ветка `feat/day16-settings-integrations-restructure`, стенд `upready_store_p01`
(бэкенд `http://localhost:9131`, панель `http://localhost:5197`), отчёт написан 2026-09-16 21:09 WITA.
Приказ Ивана — 2026-09-16 20:22 WITA. Решения, принятые по коду, а не по догадке, — в
`artifacts/docs/p01-settings-integrations-restructure/decision.md` рядом.

## Что стало

**Раздел «Подключение» (`/settings/integrations`)** — список из пяти сервисов, только состояние и
ссылка, ни одного поля ввода. У каждого своя страница, и на ней только его реквизиты:

| Адрес | Что на странице |
|---|---|
| `/settings/integrations/wildberries` | токен WB |
| `/settings/integrations/ozon` | Client-Id + Api-Key |
| `/settings/integrations/robokassa` | MerchantLogin + четыре пароля |
| `/settings/integrations/apiship` | токен ApiShip (НОВОЕ: слота не было вовсе) |
| `/settings/integrations/cdek` | тестовая и боевая пары логин/пароль СДЭК |

**Экраны площадок** `/settings/marketplaces/wildberries` и `/settings/marketplaces/ozon`: состояние
подключения, права ключа и срок, связка артикулов, загрузки, разрешённые чтения — БЕЗ полей ключа,
со ссылкой «Подключение».

**Поведение осталось на своих экранах.** `/settings/payments` — тестовый режим, алгоритм подписи,
Result URL. `/settings/delivery` — город отправления, виды доставки, наценка, порог бесплатной
доставки, способы и вебхук. На каждом — ссылка «Реквизиты → Подключение».

**Сайдбар.** Группа «Маркетплейсы»: Каталог, Цены и остатки, Заказы площадок, Отзывы, Синхронизация,
Wildberries, Ozon — последние два ведут ПРЯМО на свои страницы. «Подключение» — отдельный пункт
верхнего уровня, за пределами группы. Ни одного `to` с `#`.

**Старые адреса живут:** `/settings/wildberries` → страница WB, `/settings/ozon` → страница Ozon,
`/settings/marketplaces` → «Подключение», а якоря `#wb` / `#ozon` из прежнего сайдбара ведут на
страницу нужной площадки.

## Файлы

**Бэкенд (единственная новая функциональность — ApiShip):**
- `apps/backend/src/modules/tenant/models/tenant-integration-secret.ts` — слот `apiship`;
- `apps/backend/src/modules/tenant/migrations/Migration20260916123201.ts` — CHECK на `provider`;
  `down()` переписан руками (генератор снимал из списка ещё и `cdek`, см. decision.md §5);
- `apps/backend/src/apiship/client.ts` — единственный вызов `GET /v1/connections`, только чтение;
- `apps/backend/src/tenant-secrets/apiship.ts` — чтение и маска слота;
- `apps/backend/src/api/tenants/apiship/key/route.ts` — `GET|PUT|DELETE` через общий писатель слотов;
- `apps/backend/src/api/tenants/apiship/probe/route.ts` — отдельный маршрут пробы;
- `apps/backend/src/api/tenants/validators.ts`, `apps/backend/src/api/middlewares.ts` — схема и матчер.

**Панель:**
- новое: `routes/settings/integrations/**` (хаб, пять страниц, `cross-link`, `marketplace-slug`),
  `routes/settings/marketplaces/{screen,wildberries,ozon}/**`, `hooks/api/apiship.tsx`,
  `src/__tests__/nav-routes.test.mjs`;
- перенос форм: `routes/settings/payments/{use-robokassa-form.ts,components/**}` и
  `routes/settings/delivery/{use-cdek-form.ts,components/**}` — ОДИН хук на сервис, две страницы
  рисуют разные половины полей;
- правки: `app.tsx` (8 новых маршрутов, комментарии старых), `main-layout.tsx` (сайдбар),
  `routes/home/home.tsx` (плитка), `marketplaces/components/mp-card.tsx` (`showKeyForm`),
  три файла редиректов, `i18n/translations/{ru,en}.json`;
- удалено: `routes/settings/marketplaces/marketplaces.tsx` (118 строк) и
  `components/mp-other-integrations.tsx` (109) — прежний хаб и блок «Другие интеграции», которые
  раздел «Подключение» заменил целиком.

**Документация:** `docs/tenant-panel/integrations-for-the-owner.md` переписан под новые адреса.

## Как это замерено

### 1. Приёмка на живом стенде (правило 18f)

```
cd apps/tenant-panel && PANEL_URL=http://localhost:5197 \
  node e2e/p01-settings-integrations.e2e.mjs
```

Сценарий входит в панель тем же путём, каким входит владелица (логин → экран). Итог последнего
прогона, строкой самого сценария:

```
Проверок: 45, зелёных 45, красных 0
ALL CHECKS PASSED
rc=0
```

Выборка строк:

```
PASS  хаб «Подключение» показывает Wildberries / Ozon / Robokassa / ApiShip / СДЭК
PASS  ключ WB, положенный ДО перестройки, виден на хабе без повторного ввода
      — Wildberries … подключено ••••7788 Открыть
PASS  на хабе нет полей ввода — только состояния и ссылки  — inputs=0
PASS  ключ WB показан как сохранённый ••••7788 без повторного ввода  — сохранён ••••7788
PASS  на странице WB нет полей других сервисов  — чужих полей: 0
PASS  на экране площадки WB полей ключа НЕТ  — полей: 0
PASS  на экране площадки WB видно состояние ключа ••••7788  — найдено: true
PASS  на экране площадки Ozon полей ключа НЕТ  — полей: 0
PASS  старый адрес /settings/wildberries ведёт на /settings/marketplaces/wildberries
PASS  старый адрес /settings/ozon ведёт на /settings/marketplaces/ozon
PASS  старый адрес /settings/marketplaces ведёт на /settings/integrations
PASS  старый адрес /settings/marketplaces#wb ведёт на /settings/marketplaces/wildberries
PASS  старый адрес /settings/marketplaces#ozon ведёт на /settings/marketplaces/ozon
PASS  в сайдбаре ни одной ссылки с якорем (проверено 21)  — ссылок в DOM: 21
PASS  пункт «Подключение» стоит в сайдбаре отдельно от группы «Маркетплейсы»
PASS  реквизиты Robokassa сохранены, показана маска ••••XXXX
PASS  на «Приёме оплат» реквизитов Robokassa больше нет  — полей логина: 0
PASS  «Приём оплат» сохраняет поведенческую настройку (тестовый режим)  — checked -> unchecked
PASS  страница ApiShip честно говорит, что на кассу он не заведён
PASS  по выдуманному токену ApiShip показан ЕГО вердикт, а не наша догадка  — ApiShip не принял токен.
PASS  токен ApiShip удаляется с подтверждением  — не подключено
PASS  на странице подключения СДЭК нет настроек доставки (наценка, город)  — чужих полей: 0
PASS  реквизиты СДЭК сохранены, показана маска ••••XXXX
PASS  на «Доставке СДЭК» реквизитов аккаунта больше нет  — полей аккаунта: 0
PASS  «Доставка СДЭК» сохраняет поведенческую настройку (наценка 77)  — 77
PASS  сохранение реквизитов СДЭК НЕ сбрасывает наценку доставки  — 77
PASS  ни один секрет не вернулся в браузер (проверено ответов: 91)
```

Ключ Wildberries положен в слот ДО перестройки фикстурой
`apps/backend/scripts/fixtures/p01-stand-setup.ts` тем же писателем слотов, каким его сохранила бы
старая форма, — то есть строка неотличима от сохранённой владелицей днём раньше. Значение фиктивное,
на Wildberries никто не ходил; в отчёт попадают только последние 4 знака.

Реквизиты СДЭК — НАСТОЯЩИЕ песочные, прочитанные из `~/upready/.env.keys` ПО ИМЕНАМ
(`CDEK_API_ACCOUNT`, `CDEK_API_PASSWORD`); значения не печатались ни в лог, ни в отчёт.

Счёт сайдбара берётся СТОЯ ВНУТРИ группы «Маркетплейсы»: свёрнутая группа не рисует своих пунктов
вовсе, и подсчёт по свёрнутому сайдбару проверил бы 13 ссылок вместо 21 — молчание, похожее на
успех (именно в этой группе и стояли якоря).

Прогон до починки дал ровно один FAIL — «на экране площадки WB видно состояние ключа ••••7788»:
убрав форму, карточка сообщала ПРАВА ключа, не сказав, что ключ вообще сохранён. Починено в
`mp-card.tsx` строкой состояния, следующий прогон зелёный.

### 2. Грепы из приёмки

```
git grep -n 'to: "[^"]*#' -- apps/tenant-panel/src   -> 0 строк
git grep -n 'settings/marketplaces#' -- apps/tenant-panel/src -> 0 строк
```

### 3. Тест навигации (дешёвый вечный сторож)

```
cd apps/tenant-panel && corepack pnpm test
ℹ pass 3   ℹ fail 0
```

`src/__tests__/nav-routes.test.mjs` читает исходники: (а) ни одна цель навигации во ВСЁМ `src` не
содержит `#`; (б) каждый `to` сайдбара разрешается в маршрут, зарегистрированный в `app.tsx`;
(в) все восемь адресов из приказа Ивана зарегистрированы. Проверено, что тест ЛОВИТ дефект:
с временно возвращённым `to: "/settings/marketplaces#wb"` прогон дал `pass 1 / fail 2`, rc=1;
после отката — `pass 3 / fail 0`. Подключён в `pnpm test` панели (задача `test` в turbo уже была).

### 4. Спека и юниты бэкенда

```
cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9231 \
  TEST_TYPE=integration:http npx jest --runInBand --forceExit \
  integration-tests/http/tenants-apiship-key.spec.ts
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total

cd apps/backend && corepack pnpm test:unit
Test Suites: 83 passed, 83 total
Tests:       1156 passed, 1156 total
```

Спека проверяет: строка действительно ПИШЕТСЯ (без миграции CHECK её INSERT умер бы в рантайме при
зелёном тайпчеке — класс, записанный в w20), payload — шифротекст, литерал токена не встречается ни
в одной колонке и ни в одном ответе, пустой токен отвергается, без сессии 401, тенант B не видит и не
переписывает токен тенанта A, `DELETE` забывает и повторное сохранение оставляет ОДНУ живую строку,
проба различает «не спрошено» / «отклонён» / «ApiShip не ответил».

### 5. Ворота сборки

```
cd apps/tenant-panel && npx tsc --noEmit           -> rc=0
cd apps/tenant-panel && npx eslint src             -> rc=0 (0 errors, 24 warnings — все ДО задачи,
                                                     ни одного в файлах p01)
cd apps/tenant-panel && corepack pnpm build        -> ✓ built
cd apps/backend && npx tsc --noEmit                -> rc=0
corepack pnpm check:backend-build                  -> Backend build completed successfully
```

### 6. Форма авторизации ApiShip замерена, а не вспомнена

```
GET https://api.apiship.ru/v1/connections
  Authorization: <токен>          -> HTTP 200
  Authorization: Bearer <токен>   -> HTTP 401
```

Боевой токен прочитан из `~/upready/.env.keys` по имени `APISHIP_PROD_TOKEN`, значение никуда не
копировалось. Голая форма закреплена юнит-тестом: регрессия здесь выглядела бы как «владелица ввела
неверный токен» — самая дорогая из возможных неправд этой страницы.

### 7. Карточка задачи

```
node handoff/day-2026-09-16-oksana-store/ui/report-validate.mjs \
  handoff/day-2026-09-16-oksana-store/artifacts/p01-settings-integrations-restructure/report.json
OK …/artifacts/p01-settings-integrations-restructure/report.json: 12 done / 6 results / 1 access
```

## Скриншоты (вне git, абсолютные пути)

1280×900:
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/01-hub-integrations-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/02-integrations-wildberries-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/03-marketplaces-wildberries-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/04-marketplaces-ozon-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/05-integrations-robokassa-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/06-integrations-apiship-1280x900.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-settings-integrations-restructure/artifacts/docs/p01-settings-integrations-restructure/07-integrations-cdek-1280x900.png

390×844: те же семь экранов, суффикс `-390x844.png` в том же каталоге.

## Что НЕ сделано и почему

- **ApiShip в чекаут не заведён** — так и приказано. i02 замерил ноль тарифов у калькулятора ApiShip
  для этого аккаунта; страница говорит это владелице жёлтым алертом, а не молчит.
- **Ozon без ключа.** Экран `/settings/marketplaces/ozon` и страница подключения Ozon работают, но
  ключа Ozon у магазина нет, поэтому на стенде они показаны в состоянии «не подключено». Это
  состояние продукта, не пробел задачи.
- **`routes/settings/wildberries/wildberries.tsx`** (281 строка) — мёртвый код ДО этой задачи: ни
  одного импорта на него нет, `index.ts` экспортирует редирект. Удаление потянуло бы ветку
  компонентов `wb-*`, часть которых жива. Отдельная уборка, в приказ не входит.
- **На живой хост не деплоил** — задача этого не предписывает.

## Как приёмщику проверить за 10 минут

```bash
# 1. стенд
/opt/homebrew/Cellar/postgresql@16/16.13/bin/createdb -h 127.0.0.1 -p 5433 -U ivanprotsko \
  upready_store_p01acc -T upready_store_cherkashina
# apps/backend/.env: DATABASE_URL=…/upready_store_p01acc, PORT=9131
cd apps/backend && npx medusa db:migrate            # миграция слота apiship
npx medusa exec ./scripts/fixtures/p01-stand-setup.ts   # пароль владелицы + ключ WB «из прошлого»
npx medusa develop &
cd ../tenant-panel && npx vite --port 5197 --strictPort &

# 2. приёмка одним прогоном (45 проверок, ~3 минуты)
cd apps/tenant-panel && PANEL_URL=http://localhost:5197 node e2e/p01-settings-integrations.e2e.mjs
#   -> Проверок: 45, зелёных 45, красных 0

# 3. дешёвые ворота
corepack pnpm test                                   # 3 теста навигации
git grep -n 'to: "[^"]*#' -- apps/tenant-panel/src   # должно быть пусто
```

Глазами (критерий «человеческими глазами», правило 27d): открыть `/settings/integrations` — пять
строк, у Wildberries зелёная плашка «подключено ••••7788» и строка про права ключа; нажать «Открыть»
у Wildberries — одна форма с одним полем; перейти по ссылке внизу на страницу площадки — таблицы
есть, полей ключа нет; в сайдбаре найти «Подключение» отдельным пунктом с иконкой ключа.

## Экономия

**Перенос против нового кода (замер `git diff --numstat origin/dev...HEAD`):**

| Что | Строк |
|---|---|
| Итого по ветке | +3045 / −1038 |
| Перенос форм Robokassa и СДЭК (payments + delivery + две страницы подключения) | +1154 / −722 |
| ApiShip — единственная новая функциональность (бэкенд, панель, тесты) | +875 / −0 |
| Тесты (юнит + seam + навигация) | +398 / −0 |
| Удалённый прежний хаб и блок «другие интеграции» | −227 |

То есть из 3045 добавленных строк 875 — это новый сервис, 398 — тесты, а бОльшая часть остального
это ПЕРЕЕЗД 722 строк формы в общие хуки плюс комментарии, объясняющие, почему переезд устроен именно
так. Ни одна форма не продублирована: на сервис один хук (`use-robokassa-form.ts`, `use-cdek-form.ts`),
страницы рисуют разные половины полей.

**Что поймал скрипт вместо раунда критика:**

1. **Тест навигации** (`nav-routes.test.mjs`, 119 строк, `node --test`, без единой новой зависимости)
   — класс «пункт сайдбара ведёт на якорь». Один прогон 0,1 с против ревью, которое ловит это раз.
   Проверен в обе стороны: с дефектом `fail 2`, без дефекта `pass 3`. Это ровно то, что бриф назвал
   «дешевле браузерного прогона и охраняет класс навсегда».
2. **Приёмочный сценарий** нашёл настоящий дефект, которого не увидел бы ни тайпчек, ни линт, ни
   ревью диффа: экран площадки перестал сообщать, что ключ вообще сохранён, продолжая сообщать его
   права. Один FAIL из 45 — и это тот самый пункт приёмки Ивана.
3. **Отдельный шаг «сохранение реквизитов СДЭК не сбрасывает наценку»** — проверка по КОДУ
   бэкенда (`markup_amount: body.markup_amount ?? 0` перевыдаёт способы доставки на каждом PUT), а не
   по ощущению. Без него разрез формы надвое тихо обнулял бы наценку владелицы.
4. **Юнит на форму заголовка ApiShip** (4 теста, 0,26 с) — вместо того, чтобы ловить `Bearer` на
   живом токене в следующей задаче.
5. **Негативный прогон миграции**: сгенерированный `down()` снимал из CHECK чужой слот `cdek`.
   Поймано чтением сгенерированного файла, а не откатом на живой базе.

**Что автоматизировал бы в следующий раз.** Проверка «на странице сервиса нет полей других сервисов»
сейчас живёт в e2e через `data-testid`. Это класс: его можно закрыть тем же дешёвым `node --test` по
исходникам — «страница `/settings/integrations/<X>` не импортирует компоненты полей сервиса Y».
Тогда браузерный прогон остаётся только для того, что действительно требует браузера (редиректы,
сохранение, маски).

**Чего НЕ делал.** Ни одного сабагента и ни одного Workflow: задача — перенос форм плюс один
маленький сервис, фан-аут здесь дороже работы (правило 3b/19a). Документацию площадок не открывал
вовсе — ApiShip не WB и не Ozon, а его единственный нужный факт (форма заголовка) замерен одним
`curl` за 2 секунды.
