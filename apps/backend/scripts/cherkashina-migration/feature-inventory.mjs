// Task 1 of the Cherkashina migration: feature inventory of chrxnasdmds vs upready-store (rule 18b:
// the JSON is the record, the .md is rendered from it). Facts were read from both trees on 2026-09-12;
// see 03-migration-report.md for the measurements behind the verdicts.
import { writeFileSync } from "node:fs";
import { cliDie, cliHelp } from "./lib/cli.mjs";
import { stamp } from "./lib/psql.mjs";

const USAGE = `
feature-inventory.mjs — write the feature inventory of the source store against upready-store.
The verdicts are the record of what was read in both trees on 2026-09-12, not a fresh scan.

  node feature-inventory.mjs <dir>

Writes: <dir>/01-feature-inventory.json and <dir>/01-feature-inventory.md.
Reads: nothing. Needs no backend and no database.

  node feature-inventory.mjs artifacts/docs/2026-09-12-cherkashina-migration
`;

const argv = process.argv.slice(2);
cliHelp(argv, USAGE);
const out = argv[0];
if (!out) {
  cliDie(USAGE, "required: <dir>");
}

const APISHIP_SENDER = ["APISHIP_SENDER_NAME", "APISHIP_SENDER_PHONE", "APISHIP_SENDER_EMAIL", "APISHIP_SENDER_COMPANY", "APISHIP_SENDER_COUNTRY", "APISHIP_SENDER_INDEX", "APISHIP_SENDER_REGION", "APISHIP_SENDER_CITY", "APISHIP_SENDER_ADDRESS"];

const features = [
  {
    feature: "ApiShip fulfillment provider (Почта России + СДЭК via apiship.ru)",
    source_files: ["apps/backend/src/modules/apiship/{index,service}.ts", "apps/backend/src/modules/apiship/README.md", "apps/backend/src/lib/shipping/apiship-client.ts", "apps/backend/src/api/store/shipping/apiship/{points,calculate}/route.ts", "apps/backend/src/api/hooks/apiship/route.ts"],
    depends_on: { env_keys: ["APISHIP_TOKEN", "APISHIP_BASE", "APISHIP_AUTH_SCHEME", "APISHIP_IS_TEST", "APISHIP_MOCK", "APISHIP_WEBHOOK_SECRET", ...APISHIP_SENDER], packages: [], patches: [], tables: [] },
    exists_in_target: "no",
    verdict: "port_later",
    reason: "The buyer never sees a carrier brand (decision chrxnasdmds-checkout-legal-decisions): the abstract provider below is the one the checkout uses; `apiship` stays as its fallback client. Its credentials (token, sender address) are per merchant, so on the shared backend they cannot live in env — blocked by the per-tenant secrets fork (question to Ivan). Target registers NO fulfillment provider of its own (apps/backend/medusa-config.ts has no fulfillment module block → Medusa default manual provider).",
    effort: "M (2–3 days: provider options resolved per tenant + routes under /store with tenant scope + seam tests)",
  },
  {
    feature: "Carrier-abstraction fulfillment provider `shipping` (abstract «courier / pickup» methods, weight tariffs, carrier router)",
    source_files: ["apps/backend/src/modules/shipping/{index,service}.ts", "apps/backend/src/lib/shipping/carrier-router.ts", "apps/backend/src/lib/shipping/{cdek-client,pochta-tariff,carriers}.ts", "docs/kb/chrxn-carrier-router.md", "packages/commerce-core (pure shapes/math)"],
    depends_on: { env_keys: ["APISHIP_TOKEN", ...APISHIP_SENDER], packages: ["@upready/commerce-core (workspace)"], patches: [], tables: ["shipping_option.data (per-region carrier bindings + manual tariffs)"] },
    exists_in_target: "no",
    verdict: "port_later",
    reason: "This is the provider behind the two live shipping options of the source (Курьером до двери / Заберу сам, provider_id shipping_shipping, calculated). Depends on the ApiShip client and on @upready/commerce-core (a workspace package of chrxnasdmds, not published). Same per-tenant credential fork as ApiShip. The tenant on the target already gets the platform's default shipping options from provisionTenantWarehouseWorkflow, so the shop can open with flat-rate/manual delivery first.",
    effort: "L (commerce-core extraction + provider + per-tenant config: 4–6 days)",
  },
  {
    feature: "shipping-config module (manual pickup datasets, manual order tracking, admin views)",
    source_files: ["apps/backend/src/modules/shipping-config/**", "apps/backend/src/admin/routes/shipping-services", "apps/backend/src/admin/routes/shipping-tracking", "apps/backend/src/admin/routes/warehouse-shipments"],
    depends_on: { env_keys: [], packages: [], patches: [], tables: ["pickup_point_record (3 rows)", "order_tracking (0 rows)"] },
    exists_in_target: "no",
    verdict: "port_later",
    reason: "Only meaningful together with the carrier-abstraction provider; 3 pickup records and 0 tracking rows in the source. The target's tenant panel has its own fulfillment screens (orders → fulfill/ship).",
    effort: "M",
  },
  {
    feature: "Store shipping routes + checkout pickup UI (point picker, unified picker, Yandex map)",
    source_files: ["apps/backend/src/api/store/shipping/**", "apps/backend/src/api/store/warehouses/**", "apps/storefront/src/lib/data/apiship.ts", "apps/storefront/src/modules/checkout/components/{shipping,apiship-point-picker,unified-point-picker,pickup-map,pickup-map-yandex,address-input,address-select}"],
    depends_on: { env_keys: ["NEXT_PUBLIC_YANDEX_MAPS_KEY (storefront, read from code: pickup-map-yandex)"], packages: [], patches: [], tables: [] },
    exists_in_target: "partial",
    verdict: "port_later",
    reason: "Target checkout is the one-screen dtc-starter checkout (modules/checkout/components/checkout-*) with address autocomplete providers already wired; a pickup-point step is net-new UI on a different checkout. Follows the provider port.",
    effort: "M",
  },
  {
    feature: "Robokassa payment (plugin @gorgo/medusa-payment-robokassa 1.0.0 + pnpm patch)",
    source_files: ["apps/backend/medusa-config.ts (payment providers block, registered only when ROBOKASSA_MERCHANT_LOGIN is set)", "patches/@gorgo__medusa-payment-robokassa@1.0.0.patch (test-mode status via validated Result webhook; testPassword2 in signature; case-insensitive SignatureValue)", "apps/backend/src/api/store/robokassa/success-return/route.ts", "apps/backend/src/subscribers/order-auto-capture.ts"],
    depends_on: { env_keys: ["ROBOKASSA_MERCHANT_LOGIN", "ROBOKASSA_PASSWORD_1", "ROBOKASSA_PASSWORD_2", "ROBOKASSA_TEST_PASSWORD_1", "ROBOKASSA_TEST_PASSWORD_2", "ROBOKASSA_HASH_ALGORITHM", "ROBOKASSA_IS_TEST"], packages: ["@gorgo/medusa-payment-robokassa@1.0.0 (peer @medusajs/* ^2.14.0 — satisfied by 2.19.0; real install in this worktree 2026-09-12 10:2x: resolved, no peer conflict of its own; latest is 2.0.0-beta.4 which requires @gorgo/medusa-integration ≥0.1.5 — the plugin the target already registers with providers: [])"], patches: ["patches/@gorgo__medusa-payment-robokassa@1.0.0.patch — patches the package's own dist file, independent of the Medusa version; applies to the same 1.0.0 tarball"], tables: [] },
    exists_in_target: "no",
    verdict: "ask_ivan",
    reason: "Target registers NO payment provider (Medusa default pp_system_default). Merchant credentials are per shop (MerchantLogin OLAVKA: BankCard group + SBP only, Q-2026-08-31-10) — with one backend for every tenant they cannot come from env as in chrxnasdmds. Two routes: (a) 1.0.0 + patch, options resolved per tenant at call time; (b) 2.0.0-beta via @gorgo/medusa-integration, which stores secrets encrypted in the DB and supports «multiple instances of the same provider» (docs.gorgojs.com, fetched 2026-09-12) — but its per-tenant binding is not documented. This is the design fork asked in the report.",
    effort: "M (a: 2 days + Robokassa moderation of the new domain; b: spike 1 day first)",
  },
  {
    feature: "Payment UI: capture-payment return route, payment components, method select, MIR logo",
    source_files: ["apps/storefront/src/app/api/capture-payment/[cartId]/route.ts", "apps/storefront/src/modules/checkout/components/{payment,payment-button,payment-container,payment-method-select,payment-instructions,payment-wrapper,payment-test}", "apps/storefront/public/payment/mir.svg", "apps/backend/src/api/store/payment-methods/**"],
    depends_on: { env_keys: ["NEXT_PUBLIC_ROBOKASSA_* (none: the redirect URL comes from the session data)"], packages: [], patches: [], tables: [] },
    exists_in_target: "partial",
    verdict: "port_later",
    reason: "Target has apps/storefront/src/app/api/payment-return (redirect-based providers already anticipated, cookies lax per AGENTS.md). The provider-specific button/return handling follows the Robokassa decision. Logos: only mir.svg exists in the source (no Robokassa/SBP asset).",
    effort: "S–M",
  },
  {
    feature: "locale module (owner-enabled storefront languages, default locale)",
    source_files: ["apps/backend/src/modules/locale/**", "apps/backend/src/api/store/locales/**", "apps/backend/src/admin/routes/localizations", "apps/storefront/src/lib/i18n/{locales-config,locale-catalog,enabled-locales-context}.ts"],
    depends_on: { env_keys: [], packages: [], patches: [], tables: ["site_locale (ru default + en)"] },
    exists_in_target: "partial",
    verdict: "port_later",
    reason: "Target has 36 storefront locales and Medusa's translation module (store_locale 36 rows), but locale/currency DEFAULTS are build-time env (STOREFRONT_DEFAULT_LOCALE/LOCALE_PIN, memory upready-store-storefront-locale-address-contract). The acceptor proposed moving them into the tenant document served by /storefront/by-host — decision pending with Ivan. The tenant needs ru default + en; recorded in the registry (dataset site_locales).",
    effort: "S once the decision lands",
  },
  {
    feature: "translation module (owner overrides of UI strings + reviews) and product overrides (DB > metadata.i18n > canon)",
    source_files: ["apps/backend/src/modules/translation/**", "apps/backend/src/api/store/i18n/**", "apps/backend/src/admin/routes/translations", "apps/backend/src/admin/widgets/product-translations.tsx", "apps/storefront/src/lib/i18n/{messages-db,merge,product-overrides}.ts"],
    depends_on: { env_keys: ["OPENAI_API_KEY / ANTHROPIC_API_KEY (admin auto-translate route)"], packages: [], patches: [], tables: ["translation (ui 910×2, review 332×2, email 2×2, product el 1)", "product_translation (51 rows, 6 for live products, all en)"] },
    exists_in_target: "partial",
    verdict: "drop",
    reason: "Target uses Medusa 2.19's own translation module (featureFlags.translation, 37 296 rows on the stand) for entities, and next-intl catalogs for UI. The 6 live product translations were carried into the target's translation module (this migration); UI overrides cannot map 1:1 onto a different storefront's keys — only the page texts were carried (kind page).",
    effort: "n/a",
  },
  {
    feature: "Legal pages (offer, privacy, consents, returns, return memo, contact) as markdown with {{PLACEHOLDER}} requisites",
    source_files: ["apps/storefront/src/lib/legal/content/*.ts", "apps/storefront/src/lib/legal/requisites.ts", "apps/storefront/src/app/[countryCode]/[locale]/(main)/{terms,privacy,consent,consent-marketing,returns,contact}/page.tsx"],
    depends_on: { env_keys: [], packages: [], patches: [], tables: [] },
    exists_in_target: "partial",
    verdict: "port_now",
    reason: "Data, not code: migrated into tenant_page (contacts/privacy/offer) with tokens verbatim; the target has no placeholder resolver (resolveLegalPlaceholders) — tokens render literally until requisites are filled, the same «not filled» signal the source shows. returns/consent/consent-marketing/return-memo have no tenant_page key yet (registry: pending).",
    effort: "done for 3 of 7 pages; S for the key extension",
  },
  {
    feature: "Home banners module (hero carousel, 3 banners with i18n)",
    source_files: ["apps/backend/src/modules/home-banners/**", "apps/backend/src/api/store/home-banners/**", "apps/backend/src/admin/routes/home-banners", "packages/banner-domain, packages/banner-react"],
    depends_on: { env_keys: [], packages: ["@upready/banner-domain", "@upready/banner-react (workspace)"], patches: [], tables: ["home_banner (3 rows)"] },
    exists_in_target: "partial",
    verdict: "drop",
    reason: "Target home is the tenant home document (one hero + categories + products, piece 8). Banner #1 became the hero (title/subtitle/CTA/image, i18n.en); banners #2–#3 are preserved in the snapshot and listed as pending (proposal: promo block).",
    effort: "n/a",
  },
  {
    feature: "Blog / journal (module blog, 18 articles = 9 ru + 9 en, admin route)",
    source_files: ["apps/backend/src/modules/blog/**", "apps/backend/src/api/store/blog/**", "apps/backend/src/admin/routes/blog", "apps/storefront/src/app/[countryCode]/[locale]/(main)/journal"],
    depends_on: { env_keys: [], packages: [], patches: [], tables: ["article (18)"] },
    exists_in_target: "no",
    verdict: "ask_ivan",
    reason: "No blog in the target. 18 published articles are content Oksana wrote; options: port the blog module as a tenant-scoped feature (M) or publish the articles as tenant pages once the key list is open. Recorded as dataset articles (pending).",
    effort: "M",
  },
  {
    feature: "Courses + school (course module, entitlements, progress, grant-course-on-paid subscriber, course-core package)",
    source_files: ["apps/backend/src/modules/course/**", "apps/backend/src/api/store/courses/**", "apps/backend/src/subscribers/grant-course-on-paid.ts", "packages/course-core", "apps/storefront/src/app/[countryCode]/[locale]/(main)/courses"],
    depends_on: { env_keys: [], packages: ["@upready/course-core (workspace)"], patches: [], tables: ["course (2)", "course_entitlement (10)", "course_progress (37)"] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "A separate product line (school), not part of a shop tenant. 2 courses, 10 entitlements, 37 progress rows stay in the source; one product (course-ochishchenie-pecheni-box, metadata.course_id) references a course — migrated as a plain product.",
    effort: "n/a",
  },
  {
    feature: "Telegram login (email-link codes, customer-identity module) and Telegram order notifications",
    source_files: ["apps/backend/src/lib/telegram/order-notify.ts", "apps/backend/src/subscribers/telegram-order-notify.ts", "apps/backend/src/lib/email-link/core.ts", "apps/backend/src/api/store/email-link/**", "apps/backend/src/modules/customer-identity/**", "apps/storefront/src/app/api/tg-auth/route.ts", "apps/storefront/src/lib/data/{tg-login,tg-customer}.ts"],
    depends_on: { env_keys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_NOTIFY_CHAT_ID (read from code: order-notify.ts)"], packages: [], patches: [], tables: ["email_link_code (3)", "customer identity tables"] },
    exists_in_target: "no",
    verdict: "port_later",
    reason: "Owner notifications about new orders are useful for every tenant; the bot token is again per shop (same secrets fork). Telegram login is a source-specific auth flow; target uses emailpass for customers.",
    effort: "S (notifications) / M (login)",
  },
  {
    feature: "Yandex ID auth provider",
    source_files: ["apps/backend/src/modules/auth-yandex/**", "apps/storefront/src/app/api/{yandex-login,yandex-callback}/route.ts"],
    depends_on: { env_keys: ["YANDEX_CLIENT_ID", "YANDEX_CLIENT_SECRET", "YANDEX_CALLBACK_URL", "YANDEX_SCOPE", "YANDEX_FORCE_CONFIRM"], packages: [], patches: [], tables: ["provider_identity (0 yandex rows in the source)"] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "0 customers used it (provider_identity has only 34 emailpass rows). Per-app OAuth client again per shop.",
    effort: "n/a",
  },
  {
    feature: "AI agent chat (module agent, store route, storefront agent-demo, image-gen port)",
    source_files: ["apps/backend/src/modules/agent/**", "apps/backend/src/api/store/agent/**", "apps/storefront/src/app/api/agent/route.ts", "apps/storefront/src/lib/agent/**", "apps/storefront/src/app/[countryCode]/[locale]/(main)/agent-demo"],
    depends_on: { env_keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"], packages: [], patches: [], tables: ["agent_conversation (50)", "agent_message", "agent_event", "agent_lead"] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "Platform-level R&D (Z3 control-plane per chrxnasdmds/CLAUDE.md), not a shop feature to copy per tenant; paid keys must not be per tenant env.",
    effort: "n/a",
  },
  {
    feature: "Loyalty plugin (@medusajs/loyalty-plugin)",
    source_files: ["apps/backend/medusa-config.ts (plugins)"],
    depends_on: { env_keys: [], packages: ["@medusajs/loyalty-plugin ^2.17.2"], patches: [], tables: ["loyalty_gift_card (0 rows)"] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "0 loyalty rows in the source; a platform-wide plugin would need tenant scoping first.",
    effort: "n/a",
  },
  {
    feature: "Transactional email via Resend (order emails, email-link)",
    source_files: ["apps/backend/src/lib/email/{resend,order-emails}.ts", "apps/backend/src/subscribers/order-email-notify.ts"],
    depends_on: { env_keys: ["RESEND_API_KEY"], packages: [], patches: [], tables: ["translation (resource email, 2×2)"] },
    exists_in_target: "partial",
    verdict: "drop",
    reason: "Target ships React Email templates (36 locales) through the smtp-notification provider (SMTP_* env) — a platform sender, not per shop. Sender name/reply-to per tenant is a later platform feature.",
    effort: "n/a",
  },
  {
    feature: "set-product-aspect subscriber (image aspect ratio into product.metadata.aspect_ratio)",
    source_files: ["apps/backend/src/subscribers/set-product-aspect.ts"],
    depends_on: { env_keys: [], packages: ["image probing library (read the file before porting)"], patches: [], tables: [] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "The source storefront used metadata.aspect_ratio (31 of 38 products carry it, migrated inside metadata) for card layout; the target cards use fixed ratios.",
    effort: "n/a",
  },
  {
    feature: "Admin extensions of chrxnasdmds (routes blog, home-banners, localizations, payment-methods, shipping-services, shipping-tracking, translations, warehouse-shipments; widgets command-palette, product-translations, hide-native-translations-action)",
    source_files: ["apps/backend/src/admin/**"],
    depends_on: { env_keys: [], packages: ["@medusajs/admin-sdk 2.17.2", "react-router-dom 6.30.4"], patches: [], tables: [] },
    exists_in_target: "no",
    verdict: "drop",
    reason: "They extend the Medusa Admin of a single-store backend; the target's owner surface is the tenant panel (apps/tenant-panel, copied Admin screens under /tenants/*). Each screen follows its feature's own verdict.",
    effort: "n/a",
  },
  {
    feature: "Catalog data (38 products, 9 categories, 313 images, prices rub/usd/eur, 6 en product translations), content pages, home hero",
    source_files: ["medusa_chrxn database", "apps/storefront/public/products/**", "apps/backend/static/**", "apps/storefront/public/banners/**"],
    depends_on: { env_keys: [], packages: [], patches: [], tables: ["product, product_variant, image, product_category(_product), price, product_translation, home_banner, translation(ui)"] },
    exists_in_target: "yes",
    verdict: "port_now",
    reason: "Task 2 of this migration — see 02-mapping-registry.json and 03-migration-report.md.",
    effort: "done on the local stand",
  },
];

const inventory = { generated_at: stamp(), source: "/Users/ivanprotsko/upready/projects/chrxnasdmds (read-only, HEAD ac94c1cd + dirty tree)", target: "upready-store fix/mt-storefront-head-footer 8dba58c (worktree feat/cherkashina-tenant)", features };
writeFileSync(`${out}/01-feature-inventory.json`, JSON.stringify(inventory, null, 2) + "\n");

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [
  `# Инвентарь фич chrxnasdmds → upready-store (рендер из 01-feature-inventory.json)`,
  ``,
  `Сгенерировано ${inventory.generated_at}. Источник: ${inventory.source}. Цель: ${inventory.target}.`,
  ``,
  `| # | Фича | Есть в цели | Вердикт | Оценка | Ключи env | Пакеты/патчи |`,
  `|---|---|---|---|---|---|---|`,
  ...features.map((f, i) => `| ${i + 1} | ${esc(f.feature)} | ${f.exists_in_target} | **${f.verdict}** | ${esc(f.effort)} | ${esc(f.depends_on.env_keys.join(", "))} | ${esc([...f.depends_on.packages, ...f.depends_on.patches].join("; "))} |`),
  ``,
  `## Обоснования`,
  ``,
  ...features.flatMap((f, i) => [`### ${i + 1}. ${f.feature}`, ``, `- Файлы источника: ${f.source_files.map((s) => `\`${s}\``).join(", ")}`, f.depends_on.tables.length ? `- Таблицы: ${f.depends_on.tables.join(", ")}` : null, `- Вердикт **${f.verdict}** — ${f.reason}`, ``].filter((x) => x !== null)),
];
writeFileSync(`${out}/01-feature-inventory.md`, lines.join("\n") + "\n");
console.log(`${features.length} features → ${out}/01-feature-inventory.{json,md}`);
