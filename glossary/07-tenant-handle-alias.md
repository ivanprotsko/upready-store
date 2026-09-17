---
id: 07-tenant-handle-alias
term_ru: "алиас хэндла"
term_en: "handle_aliases"
short: "Прежний handle магазина, сохранённый навсегда — источник для 301-редиректа со старого адреса."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-handle-alias.ts
  - apps/backend/src/modules/tenant/models/tenant.ts
related:
  - 02-tenant-handle
  - 11-tenant-redirect
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-handle-alias.ts
---

# алиас хэндла (`handle_aliases`)

`tenant.handle_aliases` (`hasMany`) — каждый handle, на который магазин когда-либо отвечал. Записи не удаляются, чтобы старые ссылки на магазин продолжали редиректиться, а не давать 404.
