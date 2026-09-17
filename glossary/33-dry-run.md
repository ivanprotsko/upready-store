---
id: 33-dry-run
term_ru: "вхолостую (dry-run)"
term_en: "dry_run"
short: "Операция записи прогнана и залогирована, но в маркетплейс ничего не отправлено — панель формулирует это как «вхолостую»."
used_in:
  - apps/tenant-panel/src/i18n/translations/ru.json
  - apps/backend/src/modules/marketplace-write/models/marketplace-write-audit.ts
related:
  - 30-marketplace-write-audit
  - 16-tenant-product-import
status: устоялось
source: apps/tenant-panel/src/i18n/translations/ru.json
---

# вхолостую (dry-run) (`dry_run`)

Панельные подписи: `outcomes.dry_run` = «вхолостую, ничего не отправлено», `confirm.dryRun` = «Сейчас это черновой прогон: {{env}} не выставлена, поэтому в Wildberries ничего не уйдёт, а попытка попадёт в журнал записи», `result.dryRun` = «Вхолостую: из процесса ничего не вышло». Колонка `dry_run: boolean` модели `marketplace_write_audit` — `true`, если ничего не покинуло процесс; отказ ворот тоже считается dry-run.
