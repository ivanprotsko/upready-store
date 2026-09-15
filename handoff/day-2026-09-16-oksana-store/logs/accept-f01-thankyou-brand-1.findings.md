# Приёмка PR #38 · f01-thankyou-brand · раунд 1 — MERGED

Приёмщик замерял сам (18f), PR-тексту не верил.

## Состояние PR
- head `fix/day16-thankyou-brand`, base `dev`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.
- Точка ветвления: `branch: Created from origin/dev` (reflog) — чужих задач в ветке нет, 2 коммита.
- Диффом тронуты 7 файлов: middleware, `lib/tenant/origin.ts`, новый `lib/tenant/request-shop.ts`, два теста, `.gitignore`, отчёт. Ни секретов, ни миграций, ни удалений, ни правок protected-infra.

## Проверки в worktree (чистое дерево на origin/fix/day16-thankyou-brand)
```
npx tsc --noEmit   → rc=0
npx next lint      → rc=0, ✔ No ESLint warnings or errors
npx vitest run …   → rc=0, Test Files 15 passed (15), Tests 154 passed (154)
```

## Замер причинности (одна и та же сборка ветки, один URL)
Витрина ветки поднята на 8144 против ЖИВОГО бэкенда `https://shipshift.dev`.
- Форма старого поведения (только `Host: localhost:8144`, как читал старый код):
  `<html … data-theme="sneakers" data-mode="dark">`, «Free shipping over» — 2 вхождения. Дефект воспроизведён.
- Форма self-fetch (`Host: localhost:8144` + `x-forwarded-host: cherkashino.shipshift.dev`):
  `<html … data-theme="supplements" data-mode="light">`, «Free shipping over» — 0, «Оксана Черкашина» в шапке.

## Замер приёмки end-to-end (покупка целиком, своя, заказ №9)
Сборка ветки за TLS-прокси, ставящим `X-Forwarded-Proto/Host` как traefik; хост `cherkashino.shipshift.dev`
(`--host-resolver-rules`), живой бэкенд и живой тенант. Товар «Свечи АСД с чесноком» → чекаут → самовывоз →
демо-карта `4111 1111 1111 1111 · 12/30 · 123` → «Оплатить». На странице, НА КОТОРУЮ ПОПАЛИ, без перезагрузки:

```
url        https://cherkashino.shipshift.dev:8443/ru/order/order_01M2HFHGKE2MRYSCWFJMS6CQB6/confirmed
data-mode  light          data-theme supplements
header     ОКСАНА ЧЕРКАШИНА | Мультиварки | Стевия | АСД | Стимуляторы | Все товары | RU | ₽   (UPREADY — нет)
body содержит «Free shipping over»  → false
заказ №9, «Свечи АСД с чесноком», 1 355,00 ₽ — на месте
после смены вьюпорта на 390×844 БЕЗ перезагрузки: light / supplements
```
Сырые данные — `artifacts/accept-f01-thankyou-brand-1/measurement.json`.

По пунктам: 1 ✅ · 2 ✅ · 3 ⚠️ (см. нит 1) · 4 ✅/⚠️ (см. нит 2) · 5 ✅.

## Ниты (не основание для отказа, вынесены в комментарий к PR)
1. Критерий «body не содержит Upready» дословно не выполнен: в тексте остаются e-mail тестового покупателя
   и подписная строка «создание интернет-магазина — upready» — это `attribution` тенанта, она стоит на КАЖДОЙ
   странице магазина, включая корректно загруженную. Строка дефекта «© 2026 Upready» ушла: подвал —
   «© 2026 Оксана Черкашина. Все права защищены.». Исполнитель это честно назвал в отчёте.
2. В консоли после оплаты одно сообщение уровня error: `listTenantArticles: /store/tenant/articles did not
   answer; the journal renders empty`. Оно же стоит на чекауте ДО оплаты и к этому PR отношения не имеет
   (эндпоинт живого бэкенда), но критерий «в консоли нет ошибок» дословно оно нарушает.
3. Код не задеплоен — живая витрина до деплоя продолжает показывать дефект. После деплоя прогон повторить
   ровно на `https://cherkashino.shipshift.dev` (там `x-forwarded-host` ставит traefik, а не наш прокси).

## Заказы
Свой заказ №9 отменён под токеном владельца (`POST /tenants/orders/9/cancel` → 200, `status: canceled`).
Список владельца после приёмки: №5, 6, 7, 8, 9 — все `canceled`, незакрытых тестовых заказов не осталось.
