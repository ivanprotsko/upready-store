---
id: 09-tenant-requisites
term_ru: "реквизиты тенанта"
term_en: "tenant_requisites"
short: "Юридические данные продавца (ИП/ОГРН/адрес/телефон), которыми заполняются плейсхолдеры оферты и других юр. страниц."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-requisites.ts
  - apps/tenant-panel/src/routes/settings/requisites/requisites.tsx
related:
  - 10-legal-offer
  - 19-tenant-page
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-requisites.ts
---

# реквизиты тенанта (`tenant_requisites`)

Модель `tenant_requisites` — одна строка на тенант, каждое поле необязательно (никто не имеет права выдумать данные продавца). Значения подставляются в `{{ТОКЕН}}`-плейсхолдеры юридических страниц; `phone_confirmed=false` по умолчанию блокирует показ телефона до подтверждения владельцем.
