---
id: 20-tenant-scope
term_ru: "изоляция тенанта (scope)"
term_en: "TenantScope"
short: "Правило доступа `/tenants/*`: что может видеть вызывающий определяют module links, а не параметр запроса; чужой id читается как отсутствующий."
used_in:
  - apps/backend/src/api/tenants/tenant-scope.ts
related:
  - 01-tenant
  - 03-tenant-admin
status: устоялось
source: apps/backend/src/api/tenants/tenant-scope.ts
---

# изоляция тенанта (scope) (`TenantScope`)

`getTenantScope` и соседние хелперы файла `tenant-scope.ts`: id/канал/handle из тела запроса только СУЖАЮТ уже разрешённый набор. Отсутствие пересечения — пустая страница, а не пустой фильтр. Обращение к чужой строке отвечает NOT_FOUND, а не NOT_ALLOWED — ответ никогда не подтверждает существование чужой записи.
