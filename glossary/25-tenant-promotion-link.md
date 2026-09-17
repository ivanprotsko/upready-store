---
id: 25-tenant-promotion-link
term_ru: "владение промоакцией (tenant-promotion)"
term_en: "/tenants/promotions"
short: "Module link владения промоакцией; создающий роут вдобавок ограничивает её правилом sales_channel_id тенанта."
used_in:
  - apps/backend/src/links/tenant-promotion.ts
related:
  - 24-tenant-campaign-link
  - 05-sales-channel
status: устоялось
source: apps/backend/src/links/tenant-promotion.ts
---

# владение промоакцией (tenant-promotion) (`/tenants/promotions`)

Link `tenant-promotion.ts`: владение записано линком, а применение промоакции ограничено правилом `sales_channel_id`, добавляемым роутом создания — промоакция не уходит в чужие корзины.
