# t01-checkout-thankyou — «Application error» на странице «Спасибо» после оплаты

Замеры сделаны 2026-09-15 03:20–03:58 WITA на локальном МТ-стенде: бэкенд `medusa develop` на `:9031`
(БД `upready_store_abstract`, `127.0.0.1:5433`), витрина на `:8041` **без**
`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` — ровно как на МТ-деплое, — магазин `http://supershop.localhost:8041`.
Приёмка прогнана и на `next dev`, и на продакшен-сборке (`next build` + `next start`), потому что живой
контейнер крутит именно её.

## Диагноз (файл и строка, а не гипотеза)

Падала **не** страница заказа, а шапка и подвал, которые она рендерит.

`apps/storefront/src/app/[locale]/(main)/order/[id]/confirmed/page.tsx:24` свой заказ уже читает через
`.catch(() => null)`, так что его отказ дал бы 404, а не краш. Ронял страницу
`fetchTenantCategories` — `apps/storefront/src/lib/data/categories.ts:30-34` (до правки):

```ts
} catch (error) {
  if ((error as { status?: number })?.status !== 404) {
    throw error          // <-- сюда приходит 400 «Publishable API key required»
  }
```

Запрос, для которого витрина не смогла назвать магазин, идёт без `x-publishable-api-key`, и
`/store/tenant/product-categories` отвечает **400**, а не 404, который единственный обрабатывает
фолбэк. Ошибка вылетала из `listCategories`, а его читают `Nav`, `BottomNav` и `Footer` — сайтовые
блоки **каждого** маршрута под `(main)`. Итог: вместо страницы — `Application error: a client-side
exception has occurred`, на «Спасибо» это стек-трейс в момент, когда с карты уже списали деньги,
причём сам заказ создан и данные для него доступны.

Почему на работающих страницах этого не видно: там же, рядом, лежат `getTenantHome` и
`getStorefrontSettings` — они ту же 400 **глотают** и молча уходят в фолбэк, поэтому в логе
`Publishable API key required` было видно всегда, а 500 — только когда до сайтовых блоков доходила
очередь выполнить сам запрос.

Класс шире одного места (правило 20). Проверены все сайтовые чтения; бросали четыре:

| Загрузчик | Файл | Кто рендерит |
|---|---|---|
| `listCategories` → `fetchTenantCategories` | `src/lib/data/categories.ts` | `Nav`, `BottomNav`, `Footer` |
| `listTopCategoriesWithCounts` (свой запрос в `/store/products`) | `src/lib/data/categories.ts` | `NavH5`/`H6` |
| `listCollections` | `src/lib/data/collections.ts` | `FooterF3` |
| `listRegions` | `src/lib/data/regions.ts` | переключатели региона и валюты |

Не бросают и потому не трогались: `tenant-pages.ts` (в нём это правило и записано словами — «Never throw
into a layout render over a footer link list»), `retrieveCustomer`, `retrieveCart`, `retrieveOrder`,
`getTenantHome`, `getStorefrontSettings`, `products.ts`.

## Что изменено

- **`apps/storefront/src/lib/data/site-wide.ts` (новый)** — правило как код: `siteWideRead(label, read, fallback)`
  не пускает ошибку в рендер лэйаута, а пишет её по имени; `isNoShopError` и `describeReadFailure`
  отличают «этот запрос не смог назвать магазин» от любого другого отказа и печатают в лог всю цепочку
  (`Host` → `GET /storefront/by-host` → `x-tenant-key` → `lib/config.ts`), чтобы следующий случай стоил
  одной строки лога, а не пяти дней.
- **`categories.ts`** — оба чтения через `siteWideRead`. `fetchTenantCategories` теперь возвращает `null`
  при отказе и массив при ответе: отказ **не** выдаётся за пустой каталог, иначе он повторно отчитался бы
  как «tenant owns zero categories», то есть как баг сидирования, которым не является (правило 20a).
- **`collections.ts`, `regions.ts`** — то же самое, фолбэк — пустой список.
- **`app/[locale]/(main)/categories/[...category]/page.tsx`** — явный `notFound()` вместо разыменования
  `undefined`: поведение то же, что и было, но теперь оно написано, а не получается случайно.

Чего **не** делалось: ключ нигде не зашит, одностендовый `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` не
подставляется мультитенантному запросу, `sameSite` кук не трогался, `ignoreBuildErrors`/
`ignoreDuringBuilds` не добавлялись, исключение на странице заказа не заглушалось — данные заказа
рендерятся, см. замер ниже.

## Как измерено

### Воспроизведение до правки

Скрипт ночной приёмки `handoff/night-2026-09-14-tribute/scripts/a37-order-final.mjs` нацелен на живой
`accept-commerce-1106.shipshift.dev`; деплоить и трогать живой стенд задача запрещает, поэтому его
последовательность повторена локально (регистрация → товар → корзина → доставка → адрес → контакты →
«Оплата вручную» → демо-карта → оплата). Полная покупка на `dev` HEAD локально проходит — две правки от
2026-09-14 (`a66b527`, `e325ef2`) закрыли путь, на котором ключ терялся. Осталось состояние, в котором
ключа нет вовсе; в нём страница и падала:

```
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: mt-storefront:8000' \
    http://127.0.0.1:8041/ru/order/order_01M2GPR93202D3Y84M2432GQZ5/confirmed
500
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: supershop.localhost:8041' \
    http://127.0.0.1:8041/ru/order/order_01M2GPR93202D3Y84M2432GQZ5/confirmed
200
```

Лог витрины (продакшен-сборка) в этот момент — та же ошибка и те же кадры стека, что в логе живого
контейнера:

```
 ⨯ Error: Publishable API key required in the request header: x-publishable-api-key. …
    at <unknown> (.next/server/chunks/3050.js:5:70)
    at g (.next/server/chunks/3050.js:1:47658) {
  statusText: 'Bad Request', status: 400, digest: '…'
}
```

`dev`-сборка с сорсмапами назвала виновника поимённо:

```
[T01 REJECT] /store/products
    at async listTopCategoriesWithCounts (src/lib/data/categories.ts:132:37)
    at async NavH5 (src/modules/layout/templates/nav/variants/h5.tsx:43:55)
[T01 REJECT] /store/tenant/product-categories
    at async listCategories (src/lib/data/categories.ts:62:32)
    at async BottomNav (src/modules/layout/components/bottom-nav/index.tsx:31:39)
[T01 REJECT] /store/collections
    at async listCollections (src/lib/data/collections.ts:32:12)
    at async FooterF3 (src/modules/layout/templates/footer/variants/f3.tsx:47:29)
```

(временная инструментация в `lib/config.ts`, в коммит не вошла — `git diff` по `config.ts` пуст)

### После правки, продакшен-сборка

Полная покупка, первый рендер страницы «Спасибо» сразу после оплаты:

```
URL after pay: http://supershop.localhost:8041/ru/order/order_01M2GQW2S99R24K3M4DAY9NZ0J/confirmed
HAS order container: true
ORDER NUMBER LINE: Номер заказа: 4
TOTAL LINE: Итого 3 820,00 ₽
FIRST RENDER CONSOLE ERRORS: ["Failed to load resource: … 404 (Not Found)"]
FIRST RENDER BAD RESPONSES: []
RELOAD HAS order container: true
ACCOUNT LIST mentions the order: true
FROM ACCOUNT URL: http://supershop.localhost:8041/en/account/orders/details/order_01M2GQW2S99R24K3M4DAY9NZ0J
```

Консоль чиста от `Publishable API key required` и от digest'а. Единственная оставшаяся ошибка — 404 на
`_next/image` для `store-profiles/abstract/cube-1-hero.webp`: медиа профилей gitignored и на свежем
чекауте их нет (`research/upready-store-capabilities.md` §5), к этой задаче отношения не имеет.

То же самое прогнано на 390×844. Скриншоты (вне git):

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-checkout-thankyou/artifacts/docs/t01-checkout-thankyou/confirmed-first-render-1280x900.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-checkout-thankyou/artifacts/docs/t01-checkout-thankyou/confirmed-first-render-390x844.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-checkout-thankyou/artifacts/docs/t01-checkout-thankyou/from-account-1280x900.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-checkout-thankyou/artifacts/docs/t01-checkout-thankyou/from-account-390x844.png`

На скриншоте 1280×900 видно глазами: «Спасибо!», номер заказа 4, позиция `Cube No. 1 · Chalk white`,
итог 3 820,00 ₽, адрес, способ оплаты, а также шапка и подвал со списками категорий и коллекций —
то есть ровно те блоки, которые роняли страницу.

### Регрессия

`apps/storefront/e2e/keyless-host.e2e.mjs` — новый. Проверяет оба направления: запрос, который не может
назвать магазин, обязан деградировать, а не отвечать 500; на хосте тенанта те же маршруты обязаны
рендериться, а страница заказа — показывать сам заказ (`order-complete-container`).

```
$ STOREFRONT_PORT=8041 BACKEND_URL=http://localhost:9031 TENANT_HOST=supershop.localhost \
    ORDER_ID=order_01M2GQW2S99R24K3M4DAY9NZ0J node e2e/keyless-host.e2e.mjs
PASS GET /storefront/by-host names a shop for "supershop.localhost" — publishable key pk_651d7e2…
PASS GET /storefront/by-host names NO shop for "mt-storefront:8000" — 404, as the check needs
PASS keyless host: /ru degrades instead of crashing — HTTP 200
PASS keyless host: /ru/store degrades instead of crashing — HTTP 200
PASS keyless host: /ru/cart degrades instead of crashing — HTTP 200
PASS keyless host: /ru/account degrades instead of crashing — HTTP 200
PASS keyless host: /ru/order/order_01ORDERTHATDOESNOTEXIST/confirmed degrades instead of crashing — HTTP 200
PASS tenant host: … (5 routes) still renders — HTTP 200
PASS tenant host: /ru/order/order_01M2GQW2S99R24K3M4DAY9NZ0J/confirmed shows the order — HTTP 200

ALL CHECKS PASSED
```

Проверка проверки: с откаченными на `HEAD` тремя файлами загрузчиков тот же прогон даёт
`5 CHECK(S) FAILED`, все пять — `HTTP 500` на keyless-хосте. То есть чек ловит именно этот дефект, а не
светится зелёным сам по себе.

`Host` в чеке ставится через `node:http`: `fetch`/undici заголовок `host` молча выбрасывает, и версия
на `fetch` была бы зелёной, ничего не проверяя (поймано при первом прогоне).

### Остальные проверки

```
$ cd apps/storefront && npx tsc --noEmit        # rc=0
$ npx next lint                                 # ✔ No ESLint warnings or errors
$ npx next build                                # ✓ Compiled successfully in 7.4s / ✓ Generating static pages (18/18)
$ corepack pnpm test                            # Test Files 13 passed (13) / Tests 125 passed (125)
```

`src/lib/data/site-wide.test.ts` — 9 новых юнитов (распознавание keyless-400, текст диагностики,
поведение `siteWideRead` в обе стороны) входят в эти 125.

## Что НЕ сделано и почему

1. **Живой стенд не проверен и не задеплоен.** Деплой — задача `d01-deploy-mt-1`, трогать живое запрещено.
   Пока живой лог был доступен, из него снято: последнее падение с `digest 2524605575` —
   `2026-09-14T14:59:21Z`, всего 100 вхождений `Publishable API key required` за 120 ч. Во время замера
   контейнер `mt-storefront` исчез из `docker ps`, а `mt-backend` пересоздан (`Up 34 seconds`) — кто-то
   деплоит параллельно, поэтому живой лог перестал быть измеримой поверхностью, и я на него больше не
   ходил. Утверждать, что именно этот сценарий давал те 100 вхождений, я не могу — воспроизведён и
   починен класс, который даёт ровно ту же ошибку, тот же digest-класс и те же кадры стека.
2. **Почему запрос на живом стенде оказывался без ключа — не доказано.** Две правки от 2026-09-14
   (заголовок мидлвари + добор ключа по `host`) закрывают обе известные дыры; `/api/payment-return`
   проверен отдельно и ключ добирает (`GET /storefront/by-host?host=supershop.localhost → 200`, затем
   `/store/carts/cart_x → 404`, а не 400). Правдоподобный, но **не измеренный** остаток: middleware
   кэширует `null` на 60 с, когда `/storefront/by-host` отвечает 404 (`lib/tenant/resolve.ts:81`), — на
   старте или перезапуске бэкенда это ровно минута, в которую весь магазин рендерится без ключа. Это
   гипотеза, не диагноз; после этой правки такая минута даёт деградированную шапку вместо 500, но саму
   минуту стоит закрыть отдельной задачей.
3. `retrieveRegion` и `getCollectionByHandle` бросают по-прежнему: это чтения конкретной страницы, а не
   сайтовых блоков, и их отказ роняет только свою страницу. В этот коммит не вошли осознанно.

## Как принять за 10 минут

```bash
# стенд
cd apps/backend   && npx medusa develop                      # :9031, DB upready_store_abstract на 127.0.0.1:5433
cd apps/storefront && npx next build && npx next start -p 8041   # .env.local БЕЗ NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

# 1. регрессия (в обе стороны)
cd apps/storefront
STOREFRONT_PORT=8041 BACKEND_URL=http://localhost:9031 TENANT_HOST=<handle>.localhost \
  node e2e/keyless-host.e2e.mjs                              # ALL CHECKS PASSED

# 2. то же место до правки
git stash list >/dev/null; git show origin/dev:apps/storefront/src/lib/data/categories.ts > /tmp/old.ts
#   подменить categories.ts/collections.ts/regions.ts версиями с origin/dev и повторить пункт 1 → 5 FAIL, HTTP 500

# 3. глазами
open artifacts/docs/t01-checkout-thankyou/confirmed-first-render-1280x900.png
#   номер заказа, позиции, итог, шапка и подвал со списками — на месте
```
