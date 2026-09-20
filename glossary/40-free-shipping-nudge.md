---
id: 40-free-shipping-nudge
term_ru: "подсказка бесплатной доставки"
term_en: "StoreFreeShippingPrice"
short: "Виджет корзины/чекаута: сколько ещё нужно добавить в заказ до бесплатной доставки, порог берётся из правила цены shipping option."
used_in:
  - apps/storefront/src/modules/shipping/components/free-shipping-price-nudge/index.tsx
related:
  - 39-pickup-point
status: устоялось
source: apps/storefront/src/modules/shipping/components/free-shipping-price-nudge/index.tsx
---

# подсказка бесплатной доставки (`StoreFreeShippingPrice`)

Компонент `free-shipping-price-nudge`: порог читается из `price_rules` (правило с `attribute === "item_total"`) конкретного shipping option, а не зашит числом в компоненте — сумма зависит от того, какая опция доставки настроена у магазина.
