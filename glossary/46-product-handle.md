---
id: 46-product-handle
term_ru: "handle товара"
term_en: "handle"
short: "URL-часть товара на витрине (столбец «URL-адрес» в списке товаров панели) — не путать с handle магазина (id 02)."
used_in:
  - apps/tenant-panel/src/i18n/translations/ru.json
related:
  - 02-tenant-handle
status: устоялось
source: apps/tenant-panel/src/i18n/translations/ru.json
---

# handle товара (`handle`)

Колонка `columns.handle` списка товаров панели = «URL-адрес» — человекочитаемый URL-сегмент товара. То же слово `handle` в контексте инвентаря (`inventory.domain`-поля) подписано «Идентификатор» — третье значение того же слова в том же приложении, отдельная от tenant.handle (id 02) запись по стандарту словаря.
