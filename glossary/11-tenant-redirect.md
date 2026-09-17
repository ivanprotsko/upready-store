---
id: 11-tenant-redirect
term_ru: "редирект тенанта"
term_en: "tenant_redirect"
short: "Постраничный 301-редирект витрины: со старого пути на новый, свой на каждый магазин."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-redirect.ts
related:
  - 02-tenant-handle
  - 07-tenant-handle-alias
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-redirect.ts
---

# редирект тенанта (`tenant_redirect`)

Модель `tenant_redirect` — построчные 301-редиректы витрины конкретного тенанта: изменённый владельцем handle или строка, перенесённая из структуры URL прежнего магазина.
