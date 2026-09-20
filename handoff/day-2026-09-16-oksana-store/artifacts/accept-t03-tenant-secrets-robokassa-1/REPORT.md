# Приёмка t03-tenant-secrets-robokassa (PR #23), раунд 1 — 2026-09-15 04:25 WITA

Ветка feat/day16-tenant-secrets-psp, HEAD=2bb9902 == origin, mergeable=MERGEABLE/CLEAN, dev — предок (merge f0f71ff).

## Замеры приёмщика (не из текста PR)
```
1) Шифротекст в БД (psql :5433/upready_store_t03):
   tis_01M2GQDVECDPEAJTMXC7XHFFRZ|ten_01M2GQCSVX9B1WMSW7050EH2GF|robokassa|t|t|e3e3OvWtQEkXPJdR7h9k5DXDkRuWBGBM2sNEUgZBA3YqdlNH…|256
   select count(*) from payment_session where data::text ilike '%password%' -> 0

2) Изоляция провайдера (живой бэкенд :9047, region reg_01M29946T4AT01AYDTYKR458BM):
   ключ A -> [pp_system_default, pp_robokassa_robokassa] count=2
   ключ B -> [pp_system_default] count=1

3) Чужой секрет: зарегистрирован НОВЫЙ тенант C (ten_01M2GSE5AX78P3TJ1TADY4KBWG):
   GET /tenants/payment-settings (C) -> 200 {"settings":null}
   GET /tenants/payment-settings/tis_01M2GQDVECDPEAJTMXC7XHFFRZ (C) -> 404 not_found
   POST /store/payment-collections/pay_col_bogus/payment-sessions (ключ C, provider pp_robokassa_robokassa, data.tenant_id=A) -> 404 «not available for this shop»

4) Result-вебхук :9047/robokassa/result:
   плохая подпись на РЕАЛЬНОЙ сессии -> 400 «ERROR bad_signature»
   чужая сессия -> 400 unknown_session; без параметров -> 400 missing_params

5) Реальность оплаты (18f): order_01M2GQYA2KQPW5AH2182SW0650 (№9), payment pay_01M2GQYA01FC21X8RPERDDC2QR 7980 rub captured_at 2026-09-15 03:57:40;
   живая страница витрины curl -H 'Host: t03-shop-a.localhost' :8047/ru/order/.../confirmed -> 200, в HTML «Оплачен» x3, «Robokassa» x4

6) Проверки в воркtree:
   npx tsc --noEmit -> rc=0; npx medusa lint -> rc=0 (9 warnings, все предсуществующие)
   pnpm test:unit -> Tests: 1 failed, 69 passed; падающий profile-data.unit.spec.ts ПАДАЕТ И НА dev (проверено в основном чекауте: 1 failed, 14 passed) — не этой задачи
   DB_PORT=5433 pnpm test:integration:http -- tenants-payment-settings -> PASS, Test Suites: 1 passed, Tests: 8 passed, 8 total (весь файл), rc=0
   tenant-panel typecheck rc=0, lint rc=0; storefront tsc rc=0, next lint «No ESLint warnings or errors»
```

## Нити (не блокируют мёрж)
1. На стенде панель показывает Result URL http://localhost:5187/robokassa/result (хост панели, не бэкенда) — фолбэк по host запроса в helpers.ts; на MT-деплое подставляется BACKEND_PUBLIC_URL (compose.mt.yml), поэтому только для локальных стендов.
2. Placeholder поля MerchantLogin — «OLAVKA», логин конкретного клиента, виден всем тенантам.
3. 02d-robokassa-after-success.png и 03-order-confirmed.png — один и тот же файл (md5 b3a67298…), в теле PR перечислены как два артефакта.
4. PNG-артефакты остались untracked в воркtree — при удалении воркtree ссылки file:// из тела PR умрут.

## Итог по интеграционным тестам

Полный `test:integration:http` на ветке PR: `Test Suites: 3 failed, 10 passed`, `Tests: 22 failed, 112 passed`.
Все три падения — `listen EADDRINUSE: address already in use :::9199`, то есть гонка освобождения
порта между моими же параллельными прогонами, а не дефект кода. Перезапуск этих трёх сюит на
свободном порту (`PORT=9233`): `tenants-payment-settings` — PASS (8/8), `tenants-home` — PASS,
`tenants-domains` — `1 failed, 11 passed` (кейс «resolves a custom host … without a restart»,
лишнее поле `is_primary` в ответе). Тот же файл на `dev` (`PORT=9261`): `1 failed, 11 passed`,
то же самое падение → предсуществующая краснота, не регрессия PR #23.

Витрина: `npx next build` → `✓ Compiled successfully in 18.1s`, `build rc=0`.
