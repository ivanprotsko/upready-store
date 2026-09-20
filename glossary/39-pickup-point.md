---
id: 39-pickup-point
term_ru: "пункт выдачи"
term_en: "pickup point"
short: "Точка самовывоза; в чекауте — отдельный вариант доставки (1 точка = 1 shipping option), не строка из справочника."
used_in:
  - apps/backend/src/api/store/pickup-points/route.ts
  - apps/storefront/src/modules/checkout/components/checkout-pickup-point-sheet/index.tsx
related:
  - 40-free-shipping-nudge
status: устоялось
source: apps/backend/src/api/store/pickup-points/route.ts
---

# пункт выдачи (`pickup point`)

`GET /store/pickup-points` — общий справочник (название/адрес/часы) для будущих потребителей (админка, карта магазинов); ЧЕКАУТ его не использует. Там пункт выдачи — это `fulfillment_set`, связанный 1:1 со stock location, то есть N точек = N shipping options; список для чекаута уже получен виджетом `GET /store/shipping-options`. Идентификатор этого роута — id stock location, а не shipping option, и его нельзя писать в `cart.metadata.pickup_point_id` — туда пишется id выбранного shipping option.
