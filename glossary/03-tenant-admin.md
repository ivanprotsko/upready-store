---
id: 03-tenant-admin
term_ru: "администратор тенанта"
term_en: "tenant_admin"
short: "Учётная запись владельца/сотрудника, привязанная к одному тенанту — вход в панель."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-admin.ts
  - apps/backend/src/api/tenants/tenant-scope.ts
related:
  - 01-tenant
  - 20-tenant-scope
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-admin.ts
---

# администратор тенанта (`tenant_admin`)

Модель `tenant_admin` (`hasMany` у `tenant`) — кто может войти в панель этого магазина. Отдельно от Medusa Admin User платформы: тенант-админ видит только свой магазин через `tenant-scope`.
