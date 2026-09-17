---
id: 28-wb-write-secret
term_ru: "ключ WB на запись"
term_en: "wildberries_write"
short: "Отдельный слот секрета для операций записи в WB — ключ на чтение, даже с правами записи, не используется для отправки."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
  - apps/tenant-panel/src/i18n/translations/ru.json
related:
  - 08-tenant-integration-secret
  - 27-wb-readonly-key
  - 30-marketplace-write-audit
status: кандидат
source: apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
---

# ключ WB на запись (`wildberries_write`)

Отдельный provider `wildberries_write` списка `TENANT_INTEGRATION_PROVIDERS`, введён приказом Ивана 2026-09-16 02:46 WITA. Путь записи читает ТОЛЬКО этот слот — ключ на чтение с фактическими правами записи всё равно не пишет. На сегодня ни у одного магазина этой строки нет.
