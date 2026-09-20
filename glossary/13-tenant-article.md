---
id: 13-tenant-article
term_ru: "статья журнала"
term_en: "tenant_article"
short: "Одна запись блога магазина, своя на каждую локаль — раздел «Журнал» в панели."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-article.ts
  - apps/tenant-panel/src/routes/journal/article-list/article-list.tsx
related:
  - 01-tenant
  - 18-tenant-locale-settings
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-article.ts
---

# статья журнала (`tenant_article`)

Модель `tenant_article` — журнал (блог) магазина: одна строка на статью на локаль. В панели это раздел `routes/journal`.
