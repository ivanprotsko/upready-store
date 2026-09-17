---
id: 08-tenant-integration-secret
term_ru: "секрет интеграции тенанта"
term_en: "tenant_integration_secret"
short: "Учётные данные внешнего сервиса (WB, Ozon, Robokassa, CDEK, ApiShip), принадлежащие одному магазину, зашифрованные в БД."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
related:
  - 27-wb-readonly-key
  - 28-wb-write-secret
  - 43-robokassa-secret
  - 44-apiship-secret
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
---

# секрет интеграции тенанта (`tenant_integration_secret`)

Модель `tenant_integration_secret`: одна строка на пару (тенант, провайдер) из списка `TENANT_INTEGRATION_PROVIDERS` = robokassa, wildberries, wildberries_write, ozon, cdek, apiship. `payload` — AES-256-GCM, читается только транспортным слоем своего провайдера, никогда не отдаётся открытым текстом ни одним роутом.
