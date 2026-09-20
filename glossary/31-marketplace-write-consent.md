---
id: 31-marketplace-write-consent
term_ru: "согласие на класс операций"
term_en: "marketplace_write_consent"
short: "Явное подтверждение владелицы магазина на один класс операций записи в один маркетплейс; удаление строки = отзыв."
used_in:
  - apps/backend/src/modules/marketplace-write/models/marketplace-write-consent.ts
  - apps/tenant-panel/src/i18n/translations/ru.json
related:
  - 32-op-class
  - 30-marketplace-write-audit
status: кандидат
source: apps/backend/src/modules/marketplace-write/models/marketplace-write-consent.ts
---

# согласие на класс операций (`marketplace_write_consent`)

Модель `marketplace_write_consent`: строка = согласие. Отозвать — удалить строку, поэтому магазин без единой строки отказывает на воротах согласия любому вызову — это состояние платформы сегодня. `note` хранит буквальный текст, который видела владелица при подтверждении.
