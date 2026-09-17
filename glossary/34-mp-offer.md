---
id: 34-mp-offer
term_ru: "нормализованная позиция маркетплейса (offer)"
term_en: "mp_offer"
short: "Цена и остаток одной позиции листинга маркетплейса в единой форме — не колонка на карточке, потому что у WB и Ozon разное измерение."
used_in:
  - apps/backend/src/modules/marketplace/models/mp-offer.ts
related:
  - 35-mp-link
  - 29-mp-sync-run
status: кандидат
source: apps/backend/src/modules/marketplace/models/mp-offer.ts
---

# нормализованная позиция маркетплейса (offer) (`mp_offer`)

Модель `mp_offer`: у WB цена лежит на размере, остаток — на паре (склад, размер); у Ozon цена — на товаре, остаток — на паре (схема, sku). Одна строка на товар не может выразить ни то, ни другое, поэтому `offer_key` — производный идентификатор строки. `stock = null` значит «маркетплейс ничего не сообщил», это не то же самое, что `0`.
