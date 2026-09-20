---
id: 44-apiship-secret
term_ru: "секрет ApiShip"
term_en: "apiship"
short: "Токен агрегатора ApiShip одного магазина; хранится и проверяется, но чекаут его тарифы не читает."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
related:
  - 08-tenant-integration-secret
  - 42-cdek-fulfillment
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
---

# секрет ApiShip (`apiship`)

Provider `apiship`: одно значение `token`, авторизация заголовком `Authorization: <token>` без `Bearer`. Измерение i02 (2026-09-16) показало, что калькулятор ApiShip для этого аккаунта не возвращает тарифов, поэтому чекаут считает доставку СДЭК напрямую — секрет храним и проверяем, но не используем в оплате.
