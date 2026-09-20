---
id: 30-marketplace-write-audit
term_ru: "журнал записи в маркетплейс"
term_en: "marketplace_write_audit"
short: "Строка на каждую попытку записи в маркетплейс с исходом: refused / dry_run / sent — независимая от кода улика того, что реально произошло."
used_in:
  - apps/backend/src/modules/marketplace-write/models/marketplace-write-audit.ts
related:
  - 31-marketplace-write-consent
  - 32-op-class
  - 33-dry-run
status: кандидат
source: apps/backend/src/modules/marketplace-write/models/marketplace-write-audit.ts
---

# журнал записи в маркетплейс (`marketplace_write_audit`)

Модель `marketplace_write_audit`. `outcome` = refused (отказали ворота), dry_run (ничего не покинуло процесс), sent (маркетплейс реально получил запрос). До сборки фазы записи честный ответ — что каждая строка refused или dry_run. `payload_sha256` фиксирует отпечаток тела на момент проверки.
