---
id: 27-wb-readonly-key
term_ru: "ключ WB только на чтение"
term_en: "readOnly"
short: "Свойство ключа Wildberries: панель показывает «Права ключа» — «только чтение» / «разрешена и запись» / «не удалось определить»."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
  - apps/tenant-panel/src/i18n/translations/ru.json
related:
  - 08-tenant-integration-secret
  - 28-wb-write-secret
status: устоялось
source: apps/tenant-panel/src/i18n/translations/ru.json
---

# ключ WB только на чтение (`readOnly`)

Секрет-провайдер `wildberries` (`tenant_integration_secret`) читается транспортом `wb/transport.ts`, который сам не пишет в WB. Панель показывает права ключа тремя значениями плюс «спрашиваем ключ…» на время проверки — блок `readOnly` в `ru.json`.
