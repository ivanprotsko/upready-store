# Приёмка f03-guest-order-not-in-account · PR #42 · раунд 2 — MERGED

Приёмщик: headless `claude -p`, главный чекаут `/Users/ivanprotsko/upready/projects/upready-store` (dev).
Ветка PR `fix/day16-guest-order-claim` → base `dev`; воркtree HEAD == `origin/fix/day16-guest-order-claim` == `14261763cbc7b73fa05874c85c12e7611b59d113`.
Мерж: `gh pr merge 42 --squash` → `state: MERGED`, `mergedAt: 2026-09-15T05:30:21Z`, merge commit `74d9c01f3826e4b055e77bdab6e0e52c3a385d21`.

Находки раунда 1 сняты: №1 (конфликт HANDOFF.json) — `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`;
№2 (красный tsc витрины) — `npx tsc --noEmit` rc=0, `git diff HEAD origin/dev -- apps/storefront/src/lib/tenant/request-shop.test.ts` пуст.

## Проверки (воркtree)

| Проверка | Результат |
|---|---|
| `apps/storefront && npx tsc --noEmit` | rc=0 |
| `apps/backend && npx tsc --noEmit` | rc=0 |
| `apps/backend && npx medusa lint` | rc=0 (59 warnings, 0 errors) |
| `apps/backend && pnpm test:unit` | 218 passed, 1 failed — `profile-data.unit.spec.ts › i18n merge`; `git diff --name-only HEAD origin/dev -- apps/backend/src/migration-scripts` пуст → предсуществующий |
| seam `integration-tests/http/guest-order-claim.spec.ts` | 6 passed, 6 total (счастливый путь + 4 негатива + регистр адреса) |

## Живой замер (правило 18f)

Стенд приёмщика: БД `upready_store_f03acc2` (клон `upready_store_cherkashina` + `medusa db:migrate`),
бэкенд `:9087`, витрина `:8087`, магазин `http://cherkashino.localhost:8087`, тенант `ten_01M29Q4KYQHC70JZBENWZ8Z88M` / `cherkashino`.
Живой `cherkashino.shipshift.dev` не трогался. БД удалена после замера (`DROP DATABASE upready_store_f03acc2`), процессы стенда сняты по порту.

1. Гостевой заказ №17 `order_01M2HRA9ZERJCXES657HAF7FND`, `qa-f03-acc2-132325@upready.test`, 1355 ₽ (Store API витрины).
   Сразу после оформления: `select c.has_account …` → `f` (гость).
2. Регистрация браузером на тот же адрес (`/ru/account` → «Присоединиться»). `/ru/account/orders` **без нажатия кнопки**:
   `order cards: 1` → `Заказ №17 | Не собран | Авторизован | 15 сент. 2026 г. | 1 355,00 ₽ | 1 товар | Оксана Черкашина pickup · 0,00 ₽ | Свечи АСД с чесноком×1`.
   Скриншоты `01-account-orders-1280x900.png` (1280×900) и `02-account-orders-390x844.png` (390×844 @DPR2 = 780×1688).
3. Деталь заказа `03-order-detail-1280x900.png`: товар/вариант/1x/1 355,00 ₽, «Доставка: Иван Приёмщик, ул. Тестовая, д. 1, кв. 2, 101000 Москва, г Москва, RU», «Метод: Оксана Черкашина pickup · 0,00 ₽», «Оплата вручную».
4. Чужой аккаунт `qa-f03-acc2-stranger-132325@upready.test`: `order cards: 0`, пустой блок есть; «Найти мои заказы» → «Заказов без аккаунта на вашу почту в этом магазине не нашлось», карточек после claim 0.
   API: `GET /store/orders` чужого аккаунта → `{"orders":[],"count":0}`. Скриншот `04-stranger-account-orders-1280x900.png`.
5. Заказ жил только в одноразовой БД; на живом магазине не создано ничего, БД удалена целиком.

## Ниты (не основание для отклонения, в комментарии к PR #42)

1. **`GET /store/orders/:id` открыт всем с publishable-ключом.** Замер:
   `curl -o /dev/null -w "%{http_code}" http://localhost:9087/store/orders/order_01M2HRA9ZERJCXES657HAF7FND -H "x-publishable-api-key: <pk>" -H "authorization: Bearer <токен чужого>"` → `200`;
   **без заголовка authorization вообще** → тоже `200`. На витрине: чужой аккаунт по прямой ссылке
   `/ru/account/orders/details/<id>` видит состав, адрес доставки и телефон покупателя (скриншот `06-stranger-direct-order-url-1280x900.png`).
   Дефект НЕ этого PR: `git diff origin/dev...HEAD` маршрута не касается, в `middlewares.ts` добавлен ровно один matcher `/store/customers/me/claim-orders`.
   Родня уже названной автором находке «`/store/orders` не ограничен тенантом» — одна отдельная задача на обе.
2. Три PNG в `artifacts/docs/f03-guest-order-not-in-account/` остались незакоммиченными в воркtree (`git status` → `M`), в PR лежит предыдущая версия картинок.

## Инцидент приёмки (для дня)

В середине живого замера диск машины ушёл в ноль (`ENOSPC` на любой write, включая harness-файлы Bash) — приёмка встала примерно на 10 минут.
Причина — клоны БД: после `DROP DATABASE upready_store_f03acc2` свободно стало 25 Gi (было 189 Mi). На стенде держится ~30 баз `upready_store_*`;
просится уборка чужих клонов отдельной задачей.
