---
id: 43-robokassa-secret
term_ru: "секрет Robokassa"
term_en: "robokassa"
short: "Учётные данные платёжного провайдера Robokassa одного магазина (MerchantLogin + пароли), слот tenant_integration_secret."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
  - apps/backend/src/modules/payment-robokassa/service.ts
related:
  - 08-tenant-integration-secret
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-integration-secret.ts
---

# секрет Robokassa (`robokassa`)

Provider `robokassa` списка `TENANT_INTEGRATION_PROVIDERS`. Один бэкенд обслуживает много магазинов, поэтому платёжный аккаунт — свойство магазина, а не переменная окружения процесса; провайдер `@gorgo/medusa-integration` ищет строку по тенанту запроса. `is_test` переключает тестовые пароли и помечает платёж тестовым на стороне провайдера.
