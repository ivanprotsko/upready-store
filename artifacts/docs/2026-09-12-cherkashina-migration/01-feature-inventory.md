# Инвентарь фич chrxnasdmds → upready-store (рендер из 01-feature-inventory.json)

Сгенерировано 2026-09-12 10:30 WITA. Источник: /Users/ivanprotsko/upready/projects/chrxnasdmds (read-only, HEAD ac94c1cd + dirty tree). Цель: upready-store fix/mt-storefront-head-footer 8dba58c (worktree feat/cherkashina-tenant).

| # | Фича | Есть в цели | Вердикт | Оценка | Ключи env | Пакеты/патчи |
|---|---|---|---|---|---|---|
| 1 | ApiShip fulfillment provider (Почта России + СДЭК via apiship.ru) | no | **port_later** | M (2–3 days: provider options resolved per tenant + routes under /store with tenant scope + seam tests) | APISHIP_TOKEN, APISHIP_BASE, APISHIP_AUTH_SCHEME, APISHIP_IS_TEST, APISHIP_MOCK, APISHIP_WEBHOOK_SECRET, APISHIP_SENDER_NAME, APISHIP_SENDER_PHONE, APISHIP_SENDER_EMAIL, APISHIP_SENDER_COMPANY, APISHIP_SENDER_COUNTRY, APISHIP_SENDER_INDEX, APISHIP_SENDER_REGION, APISHIP_SENDER_CITY, APISHIP_SENDER_ADDRESS |  |
| 2 | Carrier-abstraction fulfillment provider `shipping` (abstract «courier / pickup» methods, weight tariffs, carrier router) | no | **port_later** | L (commerce-core extraction + provider + per-tenant config: 4–6 days) | APISHIP_TOKEN, APISHIP_SENDER_NAME, APISHIP_SENDER_PHONE, APISHIP_SENDER_EMAIL, APISHIP_SENDER_COMPANY, APISHIP_SENDER_COUNTRY, APISHIP_SENDER_INDEX, APISHIP_SENDER_REGION, APISHIP_SENDER_CITY, APISHIP_SENDER_ADDRESS | @upready/commerce-core (workspace) |
| 3 | shipping-config module (manual pickup datasets, manual order tracking, admin views) | no | **port_later** | M |  |  |
| 4 | Store shipping routes + checkout pickup UI (point picker, unified picker, Yandex map) | partial | **port_later** | M | NEXT_PUBLIC_YANDEX_MAPS_KEY (storefront, read from code: pickup-map-yandex) |  |
| 5 | Robokassa payment (plugin @gorgo/medusa-payment-robokassa 1.0.0 + pnpm patch) | no | **ask_ivan** | M (a: 2 days + Robokassa moderation of the new domain; b: spike 1 day first) | ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1, ROBOKASSA_PASSWORD_2, ROBOKASSA_TEST_PASSWORD_1, ROBOKASSA_TEST_PASSWORD_2, ROBOKASSA_HASH_ALGORITHM, ROBOKASSA_IS_TEST | @gorgo/medusa-payment-robokassa@1.0.0 (peer @medusajs/* ^2.14.0 — satisfied by 2.19.0; real install in this worktree 2026-09-12 10:2x: resolved, no peer conflict of its own; latest is 2.0.0-beta.4 which requires @gorgo/medusa-integration ≥0.1.5 — the plugin the target already registers with providers: []); patches/@gorgo__medusa-payment-robokassa@1.0.0.patch — patches the package's own dist file, independent of the Medusa version; applies to the same 1.0.0 tarball |
| 6 | Payment UI: capture-payment return route, payment components, method select, MIR logo | partial | **port_later** | S–M | NEXT_PUBLIC_ROBOKASSA_* (none: the redirect URL comes from the session data) |  |
| 7 | locale module (owner-enabled storefront languages, default locale) | partial | **port_later** | S once the decision lands |  |  |
| 8 | translation module (owner overrides of UI strings + reviews) and product overrides (DB > metadata.i18n > canon) | partial | **drop** | n/a | OPENAI_API_KEY / ANTHROPIC_API_KEY (admin auto-translate route) |  |
| 9 | Legal pages (offer, privacy, consents, returns, return memo, contact) as markdown with {{PLACEHOLDER}} requisites | partial | **port_now** | done for 3 of 7 pages; S for the key extension |  |  |
| 10 | Home banners module (hero carousel, 3 banners with i18n) | partial | **drop** | n/a |  | @upready/banner-domain; @upready/banner-react (workspace) |
| 11 | Blog / journal (module blog, 18 articles = 9 ru + 9 en, admin route) | no | **ask_ivan** | M |  |  |
| 12 | Courses + school (course module, entitlements, progress, grant-course-on-paid subscriber, course-core package) | no | **drop** | n/a |  | @upready/course-core (workspace) |
| 13 | Telegram login (email-link codes, customer-identity module) and Telegram order notifications | no | **port_later** | S (notifications) / M (login) | TELEGRAM_BOT_TOKEN, TELEGRAM_NOTIFY_CHAT_ID (read from code: order-notify.ts) |  |
| 14 | Yandex ID auth provider | no | **drop** | n/a | YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, YANDEX_CALLBACK_URL, YANDEX_SCOPE, YANDEX_FORCE_CONFIRM |  |
| 15 | AI agent chat (module agent, store route, storefront agent-demo, image-gen port) | no | **drop** | n/a | ANTHROPIC_API_KEY, OPENAI_API_KEY |  |
| 16 | Loyalty plugin (@medusajs/loyalty-plugin) | no | **drop** | n/a |  | @medusajs/loyalty-plugin ^2.17.2 |
| 17 | Transactional email via Resend (order emails, email-link) | partial | **drop** | n/a | RESEND_API_KEY |  |
| 18 | set-product-aspect subscriber (image aspect ratio into product.metadata.aspect_ratio) | no | **drop** | n/a |  | image probing library (read the file before porting) |
| 19 | Admin extensions of chrxnasdmds (routes blog, home-banners, localizations, payment-methods, shipping-services, shipping-tracking, translations, warehouse-shipments; widgets command-palette, product-translations, hide-native-translations-action) | no | **drop** | n/a |  | @medusajs/admin-sdk 2.17.2; react-router-dom 6.30.4 |
| 20 | Catalog data (38 products, 9 categories, 313 images, prices rub/usd/eur, 6 en product translations), content pages, home hero | yes | **port_now** | done on the local stand |  |  |

## Обоснования

### 1. ApiShip fulfillment provider (Почта России + СДЭК via apiship.ru)

- Файлы источника: `apps/backend/src/modules/apiship/{index,service}.ts`, `apps/backend/src/modules/apiship/README.md`, `apps/backend/src/lib/shipping/apiship-client.ts`, `apps/backend/src/api/store/shipping/apiship/{points,calculate}/route.ts`, `apps/backend/src/api/hooks/apiship/route.ts`
- Вердикт **port_later** — The buyer never sees a carrier brand (decision chrxnasdmds-checkout-legal-decisions): the abstract provider below is the one the checkout uses; `apiship` stays as its fallback client. Its credentials (token, sender address) are per merchant, so on the shared backend they cannot live in env — blocked by the per-tenant secrets fork (question to Ivan). Target registers NO fulfillment provider of its own (apps/backend/medusa-config.ts has no fulfillment module block → Medusa default manual provider).

### 2. Carrier-abstraction fulfillment provider `shipping` (abstract «courier / pickup» methods, weight tariffs, carrier router)

- Файлы источника: `apps/backend/src/modules/shipping/{index,service}.ts`, `apps/backend/src/lib/shipping/carrier-router.ts`, `apps/backend/src/lib/shipping/{cdek-client,pochta-tariff,carriers}.ts`, `docs/kb/chrxn-carrier-router.md`, `packages/commerce-core (pure shapes/math)`
- Таблицы: shipping_option.data (per-region carrier bindings + manual tariffs)
- Вердикт **port_later** — This is the provider behind the two live shipping options of the source (Курьером до двери / Заберу сам, provider_id shipping_shipping, calculated). Depends on the ApiShip client and on @upready/commerce-core (a workspace package of chrxnasdmds, not published). Same per-tenant credential fork as ApiShip. The tenant on the target already gets the platform's default shipping options from provisionTenantWarehouseWorkflow, so the shop can open with flat-rate/manual delivery first.

### 3. shipping-config module (manual pickup datasets, manual order tracking, admin views)

- Файлы источника: `apps/backend/src/modules/shipping-config/**`, `apps/backend/src/admin/routes/shipping-services`, `apps/backend/src/admin/routes/shipping-tracking`, `apps/backend/src/admin/routes/warehouse-shipments`
- Таблицы: pickup_point_record (3 rows), order_tracking (0 rows)
- Вердикт **port_later** — Only meaningful together with the carrier-abstraction provider; 3 pickup records and 0 tracking rows in the source. The target's tenant panel has its own fulfillment screens (orders → fulfill/ship).

### 4. Store shipping routes + checkout pickup UI (point picker, unified picker, Yandex map)

- Файлы источника: `apps/backend/src/api/store/shipping/**`, `apps/backend/src/api/store/warehouses/**`, `apps/storefront/src/lib/data/apiship.ts`, `apps/storefront/src/modules/checkout/components/{shipping,apiship-point-picker,unified-point-picker,pickup-map,pickup-map-yandex,address-input,address-select}`
- Вердикт **port_later** — Target checkout is the one-screen dtc-starter checkout (modules/checkout/components/checkout-*) with address autocomplete providers already wired; a pickup-point step is net-new UI on a different checkout. Follows the provider port.

### 5. Robokassa payment (plugin @gorgo/medusa-payment-robokassa 1.0.0 + pnpm patch)

- Файлы источника: `apps/backend/medusa-config.ts (payment providers block, registered only when ROBOKASSA_MERCHANT_LOGIN is set)`, `patches/@gorgo__medusa-payment-robokassa@1.0.0.patch (test-mode status via validated Result webhook; testPassword2 in signature; case-insensitive SignatureValue)`, `apps/backend/src/api/store/robokassa/success-return/route.ts`, `apps/backend/src/subscribers/order-auto-capture.ts`
- Вердикт **ask_ivan** — Target registers NO payment provider (Medusa default pp_system_default). Merchant credentials are per shop (MerchantLogin OLAVKA: BankCard group + SBP only, Q-2026-08-31-10) — with one backend for every tenant they cannot come from env as in chrxnasdmds. Two routes: (a) 1.0.0 + patch, options resolved per tenant at call time; (b) 2.0.0-beta via @gorgo/medusa-integration, which stores secrets encrypted in the DB and supports «multiple instances of the same provider» (docs.gorgojs.com, fetched 2026-09-12) — but its per-tenant binding is not documented. This is the design fork asked in the report.

### 6. Payment UI: capture-payment return route, payment components, method select, MIR logo

- Файлы источника: `apps/storefront/src/app/api/capture-payment/[cartId]/route.ts`, `apps/storefront/src/modules/checkout/components/{payment,payment-button,payment-container,payment-method-select,payment-instructions,payment-wrapper,payment-test}`, `apps/storefront/public/payment/mir.svg`, `apps/backend/src/api/store/payment-methods/**`
- Вердикт **port_later** — Target has apps/storefront/src/app/api/payment-return (redirect-based providers already anticipated, cookies lax per AGENTS.md). The provider-specific button/return handling follows the Robokassa decision. Logos: only mir.svg exists in the source (no Robokassa/SBP asset).

### 7. locale module (owner-enabled storefront languages, default locale)

- Файлы источника: `apps/backend/src/modules/locale/**`, `apps/backend/src/api/store/locales/**`, `apps/backend/src/admin/routes/localizations`, `apps/storefront/src/lib/i18n/{locales-config,locale-catalog,enabled-locales-context}.ts`
- Таблицы: site_locale (ru default + en)
- Вердикт **port_later** — Target has 36 storefront locales and Medusa's translation module (store_locale 36 rows), but locale/currency DEFAULTS are build-time env (STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN, memory upready-store-storefront-locale-address-contract). The acceptor proposed moving them into the tenant document served by /storefront/by-host — decision pending with Ivan. The tenant needs ru default + en; recorded in the registry (dataset site_locales).

### 8. translation module (owner overrides of UI strings + reviews) and product overrides (DB > metadata.i18n > canon)

- Файлы источника: `apps/backend/src/modules/translation/**`, `apps/backend/src/api/store/i18n/**`, `apps/backend/src/admin/routes/translations`, `apps/backend/src/admin/widgets/product-translations.tsx`, `apps/storefront/src/lib/i18n/{messages-db,merge,product-overrides}.ts`
- Таблицы: translation (ui 910×2, review 332×2, email 2×2, product el 1), product_translation (51 rows, 6 for live products, all en)
- Вердикт **drop** — Target uses Medusa 2.19's own translation module (featureFlags.translation, 37 296 rows on the stand) for entities, and next-intl catalogs for UI. The 6 live product translations were carried into the target's translation module (this migration); UI overrides cannot map 1:1 onto a different storefront's keys — only the page texts were carried (kind page).

### 9. Legal pages (offer, privacy, consents, returns, return memo, contact) as markdown with {{PLACEHOLDER}} requisites

- Файлы источника: `apps/storefront/src/lib/legal/content/*.ts`, `apps/storefront/src/lib/legal/requisites.ts`, `apps/storefront/src/app/[countryCode]/[locale]/(main)/{terms,privacy,consent,consent-marketing,returns,contact}/page.tsx`
- Вердикт **port_now** — Data, not code: migrated into tenant_page (contacts/privacy/offer) with tokens verbatim; the target has no placeholder resolver (resolveLegalPlaceholders) — tokens render literally until requisites are filled, the same «not filled» signal the source shows. returns/consent/consent-marketing/return-memo have no tenant_page key yet (registry: pending).

### 10. Home banners module (hero carousel, 3 banners with i18n)

- Файлы источника: `apps/backend/src/modules/home-banners/**`, `apps/backend/src/api/store/home-banners/**`, `apps/backend/src/admin/routes/home-banners`, `packages/banner-domain, packages/banner-react`
- Таблицы: home_banner (3 rows)
- Вердикт **drop** — Target home is the tenant home document (one hero + categories + products, piece 8). Banner #1 became the hero (title/subtitle/CTA/image, i18n.en); banners #2–#3 are preserved in the snapshot and listed as pending (proposal: promo block).

### 11. Blog / journal (module blog, 18 articles = 9 ru + 9 en, admin route)

- Файлы источника: `apps/backend/src/modules/blog/**`, `apps/backend/src/api/store/blog/**`, `apps/backend/src/admin/routes/blog`, `apps/storefront/src/app/[countryCode]/[locale]/(main)/journal`
- Таблицы: article (18)
- Вердикт **ask_ivan** — No blog in the target. 18 published articles are content Oksana wrote; options: port the blog module as a tenant-scoped feature (M) or publish the articles as tenant pages once the key list is open. Recorded as dataset articles (pending).

### 12. Courses + school (course module, entitlements, progress, grant-course-on-paid subscriber, course-core package)

- Файлы источника: `apps/backend/src/modules/course/**`, `apps/backend/src/api/store/courses/**`, `apps/backend/src/subscribers/grant-course-on-paid.ts`, `packages/course-core`, `apps/storefront/src/app/[countryCode]/[locale]/(main)/courses`
- Таблицы: course (2), course_entitlement (10), course_progress (37)
- Вердикт **drop** — A separate product line (school), not part of a shop tenant. 2 courses, 10 entitlements, 37 progress rows stay in the source; one product (course-ochishchenie-pecheni-box, metadata.course_id) references a course — migrated as a plain product.

### 13. Telegram login (email-link codes, customer-identity module) and Telegram order notifications

- Файлы источника: `apps/backend/src/lib/telegram/order-notify.ts`, `apps/backend/src/subscribers/telegram-order-notify.ts`, `apps/backend/src/lib/email-link/core.ts`, `apps/backend/src/api/store/email-link/**`, `apps/backend/src/modules/customer-identity/**`, `apps/storefront/src/app/api/tg-auth/route.ts`, `apps/storefront/src/lib/data/{tg-login,tg-customer}.ts`
- Таблицы: email_link_code (3), customer identity tables
- Вердикт **port_later** — Owner notifications about new orders are useful for every tenant; the bot token is again per shop (same secrets fork). Telegram login is a source-specific auth flow; target uses emailpass for customers.

### 14. Yandex ID auth provider

- Файлы источника: `apps/backend/src/modules/auth-yandex/**`, `apps/storefront/src/app/api/{yandex-login,yandex-callback}/route.ts`
- Таблицы: provider_identity (0 yandex rows in the source)
- Вердикт **drop** — 0 customers used it (provider_identity has only 34 emailpass rows). Per-app OAuth client again per shop.

### 15. AI agent chat (module agent, store route, storefront agent-demo, image-gen port)

- Файлы источника: `apps/backend/src/modules/agent/**`, `apps/backend/src/api/store/agent/**`, `apps/storefront/src/app/api/agent/route.ts`, `apps/storefront/src/lib/agent/**`, `apps/storefront/src/app/[countryCode]/[locale]/(main)/agent-demo`
- Таблицы: agent_conversation (50), agent_message, agent_event, agent_lead
- Вердикт **drop** — Platform-level R&D (Z3 control-plane per chrxnasdmds/CLAUDE.md), not a shop feature to copy per tenant; paid keys must not be per tenant env.

### 16. Loyalty plugin (@medusajs/loyalty-plugin)

- Файлы источника: `apps/backend/medusa-config.ts (plugins)`
- Таблицы: loyalty_gift_card (0 rows)
- Вердикт **drop** — 0 loyalty rows in the source; a platform-wide plugin would need tenant scoping first.

### 17. Transactional email via Resend (order emails, email-link)

- Файлы источника: `apps/backend/src/lib/email/{resend,order-emails}.ts`, `apps/backend/src/subscribers/order-email-notify.ts`
- Таблицы: translation (resource email, 2×2)
- Вердикт **drop** — Target ships React Email templates (36 locales) through the smtp-notification provider (SMTP_* env) — a platform sender, not per shop. Sender name/reply-to per tenant is a later platform feature.

### 18. set-product-aspect subscriber (image aspect ratio into product.metadata.aspect_ratio)

- Файлы источника: `apps/backend/src/subscribers/set-product-aspect.ts`
- Вердикт **drop** — The source storefront used metadata.aspect_ratio (31 of 38 products carry it, migrated inside metadata) for card layout; the target cards use fixed ratios.

### 19. Admin extensions of chrxnasdmds (routes blog, home-banners, localizations, payment-methods, shipping-services, shipping-tracking, translations, warehouse-shipments; widgets command-palette, product-translations, hide-native-translations-action)

- Файлы источника: `apps/backend/src/admin/**`
- Вердикт **drop** — They extend the Medusa Admin of a single-store backend; the target's owner surface is the tenant panel (apps/tenant-panel, copied Admin screens under /tenants/*). Each screen follows its feature's own verdict.

### 20. Catalog data (38 products, 9 categories, 313 images, prices rub/usd/eur, 6 en product translations), content pages, home hero

- Файлы источника: `medusa_chrxn database`, `apps/storefront/public/products/**`, `apps/backend/static/**`, `apps/storefront/public/banners/**`
- Таблицы: product, product_variant, image, product_category(_product), price, product_translation, home_banner, translation(ui)
- Вердикт **port_now** — Task 2 of this migration — see 02-mapping-registry.json and 03-migration-report.md.

