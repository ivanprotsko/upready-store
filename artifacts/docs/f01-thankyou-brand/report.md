# f01-thankyou-brand — страница «Спасибо» после оплаты остаётся магазином владельца

Отчёт написан 2026-09-15 10:32 WITA. Ветка `fix/day16-thankyou-brand`, база `dev`.

## Что было

Сразу после оплаты браузер оказывался на `/ru/order/<id>/confirmed`, и страница рендерилась
как ЧУЖОЙ магазин: `data-theme="sneakers"`, `data-mode="dark"`, шапка **UPREADY**, английская
плашка «Free shipping over $120 · 30-day returns · every pair ships in 48 hours», подвал
«© 2026 Upready. Все права защищены.». F5 на том же адресе рисовал всё правильно.

Тот же дефект раньше был 500-кой (digest `2524605575`,
`handoff/night-2026-09-14-tribute/REPORT.md`); `lib/data/site-wide.ts` превратил её в
деградированный рендер — краш ушёл, чужой бренд остался.

## Причина (замерена, не предположена)

`placeOrder()` (`apps/storefront/src/lib/data/cart.ts:473`) — серверный экшен, который
заканчивается `redirect()`. Next рендерит цель такого редиректа, **делая HTTP-запрос к самому
себе**: `createRedirectRenderResult` в
`node_modules/next/dist/server/app-render/action-handler.js:274-296` собирает URL из
СОБСТВЕННОГО origin процесса (`initURL` / `__NEXT_PRIVATE_ORIGIN`), а не из адреса магазина.
Заголовки исходного запроса он пробрасывает целиком, но `Host` у этого запроса — адрес, на
котором слушает процесс.

Замер на локальном МТ-стенде (витрина `ssshop.localhost:8043`, бэкенд `:9031`), временный лог
в `middleware()` на входе, покупка проведена браузером как покупателем:

```
[F01] {"method":"POST","path":"/ru/checkout","host":"ssshop.localhost:8043","xfh":"ssshop.localhost:8043", ...}
[F01] {"method":"GET","path":"/ru/order/order_01M2HDGA0VTDDXT26Y3YZ3392J/confirmed",
       "host":"localhost:8043","xfh":"ssshop.localhost:8043",
       "inHandle":"ssshop","inKey":"yes","inTheme":"electronics"}
```

Вторая строка — тот самый внутренний GET. `Host` = `localhost:8043` → `resolveTenantByHost`
не находит магазин → `tenantRequestHeaders` стирает входящие `x-tenant-*` (правильно: их
присылает кто угодно) и не пишет своих → рендер идёт БЕЗ тенанта: тема build-профиля на
`<html>`, имя build-профиля в шапке, промо чужого профиля, и Store API отвечает
`400 Publishable API key required` (в логе витрины того же прогона: `getTenantHome`,
`getStorefrontSettings`).

Адрес покупателя при этом никуда не девается — он приезжает на `x-forwarded-host`.

**Это класс, а не одна страница.** Через тот же внутренний запрос рендерится цель любого
серверного экшена с `redirect()`: `applyRegion` (`lib/data/cart.ts:558`) и `signout`
(`lib/data/customer.ts:269`).

## Что изменено

| Файл | Что |
|---|---|
| `apps/storefront/src/lib/tenant/request-shop.ts` (новый) | `resolveShopOfRequest()` — правило двух адресов и вся история дефекта в шапке модуля |
| `apps/storefront/src/lib/tenant/request-shop.test.ts` (новый) | 6 тестов на это правило |
| `apps/storefront/src/lib/tenant/origin.ts` | `forwardedHost()`, `publicHost()`; `requestPort()` берёт порт из ПУБЛИЧНОГО адреса, а не из сокета, на который пришёл запрос |
| `apps/storefront/src/lib/tenant/origin.test.ts` | +11 тестов на `publicHost`/`requestPort` |
| `apps/storefront/src/middleware.ts` | магазин резолвится через `resolveShopOfRequest`; `primaryHostRedirect` и `x-tenant-origin` считаются от адреса, который НАЗВАЛ магазин; демо-хост определяется по публичному адресу |

Правило: **`Host` первым, `x-forwarded-host` — только там, где `Host` не назвал ни одного
магазина.** Запрос, чей `Host` уже назвал магазин, отвечает ИМ и на заголовок не смотрит —
подделанный `x-forwarded-host` не может перевести запрос с одного тенанта на другой. Запасной
путь работает только там, где ответ и без него был бы «магазина нет»: внутренний self-fetch и
хосты, за которыми и правда никого нет. (`x-forwarded-host` пишет traefik на живом стенде, но
Next дописывает его и сам, когда никто не написал, — поэтому запасным, а не главным.)

## Как замерено (правило 18f)

Живой магазин клиента `cherkashino` (бэкенд `https://shipshift.dev`, тенант
`ten_01M2GQVGEN1204CN90C510DNRG`, тема `supplements`/`light`). Один и тот же скрипт, покупка
демо-картой `4111 1111 1111 1111 · 12/30 · 123`, замер на странице, НА КОТОРУЮ ПОПАЛИ, без
перезагрузки.

**«До» — развёрнутая витрина `https://cherkashino.shipshift.dev`, заказ №8:**

```
LANDED URL: https://cherkashino.shipshift.dev/ru/order/order_01M2HEAJF5H3XFB9TYG021EYB5/confirmed
dataMode: "dark"           dataTheme: "sneakers"
headerText: "UPREADY"
footerText: "Free shipping over $120 | 30-day returns | every pair ships in 48 hours | UPREADY |
             © 2026 Upready. Все права защищены. | создание интернет-магазина — upready"
bodyHasFreeShipping: true
orderNumber: "8"   itemLine: "Свечи АСД с чесноком"   totalLine: "1 355,00 ₽"
```

**«После» — production-сборка ЭТОЙ ветки (`next build && next start`), тот же живой бэкенд и
тот же тенант, TLS-прокси перед процессом (как traefik: `X-Forwarded-Proto`/`-Host`), заказ №7:**

```
LANDED URL: https://cherkashino.shipshift.dev:8443/ru/order/order_01M2HE6A58GZTJKXB59XS580KB/confirmed
dataMode: "light"          dataTheme: "supplements"
headerText: "ОКСАНА ЧЕРКАШИНА | Мультиварки | Стевия | АСД | Стимуляторы | Все товары | RU | ₽"
footerText: "ОКСАНА ЧЕРКАШИНА | … | © 2026 Оксана Черкашина. Все права защищены. |
             создание интернет-магазина — upready"
headerHasOksana: true      headerHasUpready: false
bodyHasFreeShipping: false
orderNumber: "7"   itemLine: "Свечи АСД с чесноком"   totalLine: "1 355,00 ₽"
CONSOLE ERRORS AFTER PAY: []
AFTER RESIZE (still no reload): {"dataMode":"light","dataTheme":"supplements"}
```

По пунктам приёмки:

1. `data-mode` = `light`, `data-theme` = `supplements` — **да**.
2. шапка содержит «ОКСАНА ЧЕРКАШИНА» и не содержит «UPREADY» — **да**.
3. `body.innerText` не содержит «Free shipping over» — **да**. Слово «Upready» в тексте
   осталось трижды, и все три — не дефект: дважды это адрес тестового покупателя
   `f01-thankyou@upready.dev`, и один раз — подписная строка «создание интернет-магазина —
   upready», которую бэкенд отдаёт как `attribution` этого тенанта и которая стоит на КАЖДОЙ
   странице магазина, включая правильно загруженную. Строка дефекта «© 2026 Upready. Все права
   защищены.» исчезла: подвал теперь «© 2026 Оксана Черкашина. Все права защищены.».
   (Критерий «не содержит Upready» дословно не выполним ни на одном корректном рендере этого
   магазина — пока у тенанта включена подпись.)
4. номер заказа 7, товар «Свечи АСД с чесноком», итог 1 355,00 ₽ на месте; ошибок в консоли
   браузера после оплаты — ноль.
5. снимки 1280×900 и 390×844 — ниже.

Дополнительно, локальный МТ-стенд (та же покупка, до и после правки):
`data-theme` `geist` → `electronics`, и `Publishable API key required` в логе витрины исчез.

**Снимки** (вне git):

- `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/f01-thankyou-brand/fixed-order-confirmed-1280x900.png`
- `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/f01-thankyou-brand/fixed-order-confirmed-390x844.png`
- `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/f01-thankyou-brand/deployed-before-order-confirmed-1280x900.png`
- `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/f01-thankyou-brand/deployed-before-order-confirmed-390x844.png`

Копии — в `artifacts/docs/f01-thankyou-brand/` этого worktree.

**Заказы в магазине владельца.** Оба тестовых заказа отменены под токеном владельца
(`POST /tenants/orders/<id>/cancel`, actor type `tenant`), список владельца после отмены:

```
[{n:5, canceled}, {n:6, canceled}, {n:7, canceled}, {n:8, canceled}]
```

№5 и №6 — заказы приёмки q01, тоже отменённые. Своего незакрытого заказа я не оставил.

## Проверки

```
npx tsc --noEmit                 → rc=0
npx next lint                    → ✔ No ESLint warnings or errors
npx vitest run …                 → Test Files 15 passed (15), Tests 154 passed (154)
npx next build                   → ✓ Compiled successfully, ✓ Generating static pages (18/18)
```

(`next build` шёл в отдельный `NEXT_DIST_DIR=.next-f01`, чтобы не затирать вывод живого
dev-сервера; побочные правки `tsconfig.json`/`next-env.d.ts`, которые Next при этом делает,
откачены и в коммит не попали.)

## Чего НЕ сделано

- **Не задеплоено.** Код лежит в ветке; деплой — команда Ивана (правило 21c). До деплоя живая
  витрина продолжает показывать дефект: замер «до» выше сделан на ней сегодня в 10:28 WITA.
- Приёмка «после» шла на production-сборке этой ветки, поднятой локально против ЖИВОГО бэкенда
  и живого тенанта, за TLS-прокси, который ставит `X-Forwarded-*` так же, как traefik. Это не
  сам контейнер `mt-storefront`; после деплоя стоит повторить ровно этот прогон на
  `https://cherkashino.shipshift.dev`.
- Соседние экшены того же класса (`applyRegion`, `signout`) правкой покрыты — она в middleware,
  общем для всех запросов, — но живьём каждый из них я не прогонял: переключатель региона в
  скриптовом прогоне не открылся по селекторам, и я не стал тратить на него заказы.

## Как принять за 10 минут

1. `git fetch && git checkout fix/day16-thankyou-brand && pnpm install`
2. `cd apps/storefront && npx tsc --noEmit && npx vitest run --passWithNoTests --exclude "**/node_modules/**" --exclude "**/.next/**" --exclude "tests/ui-lab/**"`
   — ожидается rc=0 и `154 passed`.
3. Читать `src/lib/tenant/request-shop.ts` — правило и вся доказательная база в шапке модуля.
4. После деплоя: положить товар в корзину на `https://cherkashino.shipshift.dev/ru`, оплатить
   демо-картой `4111 1111 1111 1111 · 12/30 · 123` и НЕ перезагружая страницу проверить в
   консоли:
   `document.documentElement.dataset.mode` → `light`,
   `document.documentElement.dataset.theme` → `supplements`,
   `document.querySelector('header').innerText` → содержит «ОКСАНА ЧЕРКАШИНА»,
   `document.body.innerText.includes('Free shipping over')` → `false`.
   Заказ потом отменить в панели владельца.
