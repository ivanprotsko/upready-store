---
id: 06-publishable-api-key
term_ru: "публикуемый API-ключ"
term_en: "publishable key"
short: "Ключ, которым витрина тенанта вызывает Store API; связан с тенантом через module link, читается открыто."
used_in:
  - apps/backend/src/links/tenant-api-key.ts
related:
  - 01-tenant
  - 05-sales-channel
status: устоялось
source: apps/backend/src/links/tenant-api-key.ts
---

# публикуемый API-ключ (`publishable key`)

Publishable API Key Medusa, связанный с тенантом через link `tenant-api-key.ts`. Хранится в открытом виде (это публичный ключ витрины, не секрет), `GET /tenants/me` возвращает его владельцу. Один ключ на тенант — инвариант воркфлоу, не ограничение БД.
