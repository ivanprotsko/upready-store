---
id: 41-product-review
term_ru: "отзыв о товаре"
term_en: "product_review"
short: "Отзыв покупателя о товаре с одной из трёх статей происхождения: shop / imported / wb."
used_in:
  - apps/backend/src/modules/product-review/models/product-review.ts
related:
  - 36-wb-mirror
status: устоялось
source: apps/backend/src/modules/product-review/models/product-review.ts
---

# отзыв о товаре (`product_review`)

Модель `product_review`: `REVIEW_SOURCES` = shop (оставлен на витрине), imported (перенесён из прежнего магазина владельца), wb (перенесён из карточки WB через зеркало обогащения каталога). Источник только показывается в панели, модерация одна и та же для всех.
