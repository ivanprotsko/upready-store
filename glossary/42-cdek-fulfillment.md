---
id: 42-cdek-fulfillment
term_ru: "доставка СДЭК"
term_en: "cdek_cdek"
short: "Провайдер выполнения заказов Medusa для расчёта и оформления доставки через СДЭК."
used_in:
  - apps/backend/src/modules/cdek-fulfillment/service.ts
related:
  - 39-pickup-point
  - 44-apiship-secret
status: устоялось
source: apps/backend/src/modules/cdek-fulfillment/index.ts
---

# доставка СДЭК (`cdek_cdek`)

Модуль `cdek-fulfillment` подключается как Fulfillment Provider Medusa; используется для расчёта тарифов и оформления отправок через СДЭК (см. также решение i02 по ApiShip — калькулятор ApiShip не используется, чекаут считает тариф СДЭК напрямую).
