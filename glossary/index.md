# Глоссарий upready-store

Стандарт: `~/upready/memory/glossary-standard-sensediff-terminus.md` (решение Ивана 2026-09-05).
Записей: 46. Статусы: устоялось — 36, кандидат — 10.

Каждая запись — файл `<id>.md` с frontmatter (id, term_ru, term_en, short, used_in, related, status, source) и полным описанием в теле. Проверка — `node glossary/check.mjs`.

| id | термин | code/UI | статус |
|---|---|---|---|
| [01-tenant](./01-tenant.md) | тенант | `tenant` | устоялось |
| [02-tenant-handle](./02-tenant-handle.md) | хэндл тенанта | `handle` | устоялось |
| [03-tenant-admin](./03-tenant-admin.md) | администратор тенанта | `tenant_admin` | устоялось |
| [04-tenant-domain](./04-tenant-domain.md) | домен тенанта | `tenant_domain` | устоялось |
| [05-sales-channel](./05-sales-channel.md) | канал продаж | `sales channel` | устоялось |
| [06-publishable-api-key](./06-publishable-api-key.md) | публикуемый API-ключ | `publishable key` | устоялось |
| [07-tenant-handle-alias](./07-tenant-handle-alias.md) | алиас хэндла | `handle_aliases` | устоялось |
| [08-tenant-integration-secret](./08-tenant-integration-secret.md) | секрет интеграции тенанта | `tenant_integration_secret` | устоялось |
| [09-tenant-requisites](./09-tenant-requisites.md) | реквизиты тенанта | `tenant_requisites` | устоялось |
| [10-legal-offer](./10-legal-offer.md) | публичная оферта | `offer` | устоялось |
| [11-tenant-redirect](./11-tenant-redirect.md) | редирект тенанта | `tenant_redirect` | устоялось |
| [12-tenant-notification-settings](./12-tenant-notification-settings.md) | настройки уведомлений тенанта | `tenant_notification_settings` | устоялось |
| [13-tenant-article](./13-tenant-article.md) | статья журнала | `tenant_article` | устоялось |
| [14-tenant-product-attribute](./14-tenant-product-attribute.md) | характеристика товара | `tenant_product_attribute` | кандидат |
| [15-tenant-product-attribute-option](./15-tenant-product-attribute-option.md) | значение характеристики (select) | `tenant_product_attribute_option` | кандидат |
| [16-tenant-product-import](./16-tenant-product-import.md) | импорт каталога (dry-run) | `tenant_product_import` | устоялось |
| [17-tenant-home-config](./17-tenant-home-config.md) | конфигурация главной | `tenant_home_config` | устоялось |
| [18-tenant-locale-settings](./18-tenant-locale-settings.md) | языковые настройки тенанта | `tenant_locale_settings` | устоялось |
| [19-tenant-page](./19-tenant-page.md) | страница магазина | `tenant_page` | устоялось |
| [20-tenant-scope](./20-tenant-scope.md) | изоляция тенанта (scope) | `TenantScope` | устоялось |
| [21-tenant-product-link](./21-tenant-product-link.md) | владение товаром (tenant-product) | `tenant.products` | устоялось |
| [22-tenant-order-link](./22-tenant-order-link.md) | владение заказом (tenant-order) | `/tenants/orders` | устоялось |
| [23-tenant-product-category-link](./23-tenant-product-category-link.md) | владение категорией (tenant-product-category) | `/tenants/product-categories` | устоялось |
| [24-tenant-campaign-link](./24-tenant-campaign-link.md) | владение кампанией (tenant-campaign) | `/tenants/campaigns` | устоялось |
| [25-tenant-promotion-link](./25-tenant-promotion-link.md) | владение промоакцией (tenant-promotion) | `/tenants/promotions` | устоялось |
| [26-wb-sync-run](./26-wb-sync-run.md) | прогон синхронизации WB | `wb_sync_run` | устоялось |
| [27-wb-readonly-key](./27-wb-readonly-key.md) | ключ WB только на чтение | `readOnly` | устоялось |
| [28-wb-write-secret](./28-wb-write-secret.md) | ключ WB на запись | `wildberries_write` | кандидат |
| [29-mp-sync-run](./29-mp-sync-run.md) | прогон синхронизации маркетплейса | `mp_sync_run` | кандидат |
| [30-marketplace-write-audit](./30-marketplace-write-audit.md) | журнал записи в маркетплейс | `marketplace_write_audit` | кандидат |
| [31-marketplace-write-consent](./31-marketplace-write-consent.md) | согласие на класс операций | `marketplace_write_consent` | кандидат |
| [32-op-class](./32-op-class.md) | класс операций | `opClass` | кандидат |
| [33-dry-run](./33-dry-run.md) | вхолостую (dry-run) | `dry_run` | устоялось |
| [34-mp-offer](./34-mp-offer.md) | нормализованная позиция маркетплейса (offer) | `mp_offer` | кандидат |
| [35-mp-link](./35-mp-link.md) | связь карточки маркетплейса с товаром | `mp_link` | кандидат |
| [36-wb-mirror](./36-wb-mirror.md) | зеркало WB | `mirrors` | устоялось |
| [37-wb-fbs-order](./37-wb-fbs-order.md) | сборочное задание FBS (WB) | `wb_fbs_order` | устоялось |
| [38-ozon-posting](./38-ozon-posting.md) | отправление Ozon (posting) | `ozon_posting` | устоялось |
| [39-pickup-point](./39-pickup-point.md) | пункт выдачи | `pickup point` | устоялось |
| [40-free-shipping-nudge](./40-free-shipping-nudge.md) | подсказка бесплатной доставки | `StoreFreeShippingPrice` | устоялось |
| [41-product-review](./41-product-review.md) | отзыв о товаре | `product_review` | устоялось |
| [42-cdek-fulfillment](./42-cdek-fulfillment.md) | доставка СДЭК | `cdek_cdek` | устоялось |
| [43-robokassa-secret](./43-robokassa-secret.md) | секрет Robokassa | `robokassa` | устоялось |
| [44-apiship-secret](./44-apiship-secret.md) | секрет ApiShip | `apiship` | устоялось |
| [45-medusa-product-option](./45-medusa-product-option.md) | опция товара (Medusa) | `product_option` | кандидат |
| [46-product-handle](./46-product-handle.md) | handle товара | `handle` | устоялось |
