# Промпт соло-агенту: магазин Оксаны Черкашиной как тенант upready-store

Написан приёмщиком волны upready-store 2026-09-12 08:59 WITA по приказу Ивана (08:20 WITA: «эта сессия —
только приёмка», промпт — отдельной соло-сессии). Исполнение — НЕ в сессии приёмщика. Вставлять целиком
в новое окно, открытое в `/Users/ivanprotsko/upready/projects/upready-store`.

Что приёмщик проверил перед написанием (5b/7): grep по chrxnasdmds (apiship, robokassa, миграции,
локали, страницы), по трём веткам upready-store (tenants, seed, by-host, tenant-panel), память
`~/upready/memory/chrxnasdmds-*.md`, `qa.mjs search` (решения Q-2026-08-31-10, Q-2026-09-03-01,
Q-2026-09-11-01/02). Замер источника `medusa_chrxn` снят запросами 08:5x WITA и приведён в промпте как
БАЗА ДЛЯ ПЕРЕМЕРА, не как данные для копирования. База ветки — `fix/mt-storefront-head-footer`
(8dba58c, то, что стоит на проде; дерево чистое); три трека волны ещё на приёмке и в базу не входят.

```
[DIR: /Users/ivanprotsko/upready/projects/upready-store]
You are a SOLO session (rule 3: no fan-out — no Agent, no Workflow; you do the work yourself). Project:
upready-store — multi-tenant Medusa 2.19.0 backend + Next.js 15 storefront + tenant panel (Geist). The
tenant code lives on the multi-tenant trunk `fix/mt-storefront-head-footer` (8dba58c = what runs on
prod), NOT on `dev` (`dev` holds acceptance documents only). Three tracks are still under acceptance and
are NOT your base: feat/abstract-datasets, feat/mode-image-pairs, feat/mt-storefront-wave2 — read them
if useful, never base on them; a rebase later is Ivan's call.

FIRST ACTION — your own branch and worktree (rule 21e, one branch = one worktree), then work ONLY there:
  cd /Users/ivanprotsko/upready/projects/upready-store
  git worktree add -b feat/cherkashina-tenant /Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant fix/mt-storefront-head-footer
  cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant
  pwd && grep -rn "createTenantWorkflow\|tenant_page\|by-host" apps/backend/src --include='*.ts' -l | head   # rule 5b
Your artifacts go to `artifacts/docs/2026-09-12-cherkashina-migration/` in that worktree. Screenshots
and image bytes stay out of git (21f). No writes to any other worktree, to `dev`, or to the chrxnasdmds
repository.

IVAN'S ORDER — VERBATIM (Russian, 2026-09-12 08:20 WITA), this is the scope:
  1. В /Users/ivanprotsko/upready/projects/chrxnasdmds сейчас находится магазин клиента Оксаны
     Черкашиной; там подключали и настраивали apiship и robokassa. Агент должен выяснить, код
     какого функционала следует позаимствовать из того проекта, чтобы настроить магазин этого
     клиента в ЭТОМ проекте (upready-store) как магазин одного из тенантов.
  2. Нужно сохранить все данные:
     2.1. товаров, включая принадлежность к категориям, стоимость и локализации, если они есть,
          а также изображения каждого товара с пометкой, какое из них показывается в карточке
          товара в списке и какое — «по умолчанию» на странице товара;
     2.2. контент-страницы: о магазине, политика конфиденциальности, оферта и прочие;
     2.3. для всех переносимых данных — также данные их локализаций;
     2.4. всё остальное, что Иван не перечислил, но что должно присутствовать на новом сайте в
          рамках этого проекта.
In English: (1) decide which functionality's code to borrow from chrxnasdmds (ApiShip, Robokassa were
integrated and configured there) to set this client's store up in upready-store as one tenant's store;
(2) keep ALL data: 2.1 products with category membership, prices, localizations if any, and every
product image marked as «shown on the list card» / «default on the product page»; 2.2 content pages
(about, privacy policy, public offer, and the rest); 2.3 localizations of everything migrated; 2.4
everything else Ivan did not list but which must be present on the new site within this project.

READ FIRST, IN THIS ORDER (all paths verified to exist on 2026-09-12 08:59 WITA):
  Target (this project; read on your worktree = the trunk):
  1. AGENTS.md — repository conventions, commands, what breaks silently
  2. docs/multitenancy/tenant-bundle-format.md, docs/multitenancy/storefront-by-host.md,
     docs/multitenancy/onboarding-spec.md, docs/multitenancy/admin-tenants-api-contract.md,
     docs/tenant-panel/api-contract.md, deploy/README.md
  3. apps/backend/src/modules/tenant/models/*.ts (tenant, tenant_page {key, locale, title, body,
     published}, tenant_home_config {config json}, tenant_domain, tenant_admin),
     apps/backend/src/api/tenants/ (products, product-categories, pages, home, uploads, domains,
     store, regions…), apps/backend/src/api/storefront/by-host/route.ts,
     apps/backend/src/workflows/tenant/ (create-tenant, create-tenant-product,
     create-tenant-product-category, upsert-tenant-home, export-tenant),
     apps/storefront/src/lib/data/tenant-pages.ts and tenant-home.ts, apps/backend/medusa-config.ts
  4. Read-only reference on the sibling worktree
     /Users/ivanprotsko/upready/worktrees/upready-store/feat/abstract-datasets: apps/backend/src/api/
     tenants/seed/route.ts + apps/backend/src/workflows/tenant/seed-tenant-dataset/ — how a tenant
     catalog is created (categories ×2 levels, tenant-category links, collections, createProducts on
     the tenant's sales channel, tenant-product links; handle/SKU suffixed with the tenant because
     Medusa keeps them globally unique). Do not write there.
  5. specs/tenant-address/CANONICAL.md — tenant address policy (<handle>.upready.dev, custom domains)
  Source (chrxnasdmds; read-only, see the guard note below):
  6. /Users/ivanprotsko/upready/projects/chrxnasdmds/CLAUDE.md and README.md — stack (Medusa 2.17.2,
     Next 15.3.9, i18n en/ru/uk/ja, routes [countryCode]/[locale]/(main|checkout)), local DB
     medusa_chrxn on :5433, live rings
  7. apps/backend/medusa-config.ts — fulfillment providers manual + ./src/modules/apiship +
     ./src/modules/shipping (carrier abstraction), payment @gorgo/medusa-payment-robokassa
     (registered only when ROBOKASSA_MERCHANT_LOGIN is set), modules blog, home-banners, translation,
     locale, ai-images, agent, shipping-config, course, customer-identity, auth (emailpass + yandex),
     plugin @medusajs/loyalty-plugin; root package.json → pnpm patch
     patches/@gorgo__medusa-payment-robokassa@1.0.0.patch
  8. apps/backend/src/modules/apiship/README.md, docs/kb/chrxn-carrier-router.md,
     apps/backend/src/api/store/robokassa/success-return/route.ts,
     apps/storefront/src/app/api/capture-payment/[cartId]/route.ts,
     apps/storefront/src/lib/data/apiship.ts, apps/storefront/src/modules/checkout/components/
     {shipping,apiship-point-picker,unified-point-picker,pickup-map-yandex,payment,payment-button}
  9. apps/backend/src/modules/translation/models/translation.ts (resource ui/review/email/product;
     entity content uses metadata.i18n[locale] — the house pattern),
     apps/storefront/src/lib/i18n/product-overrides.ts (DB-override > metadata.i18n > canon),
     apps/backend/src/scripts/apply-olavka-card-images.ts (thumbnail = list card image, gallery
     rank 0 = first image on the product page — the two marks Ivan asks for),
     apps/storefront/src/lib/legal/content/*.ts + requisites.ts (legal pages as markdown with
     {{PLACEHOLDER}} tokens), apps/backend/src/data/pages.json (39 legacy entries),
     apps/storefront/src/app/[countryCode]/[locale]/(main)/ (about, delivery, faq, privacy, terms,
     returns, contact, consent, wholesale, pages/bundle-assortment… — which pages actually render)
  Memory (facts already established — do not rediscover them from code):
  10. ~/upready/memory/chrxnasdmds-catalog-media-facts.md — 38 products = 38 SKUs, no variants;
      where image bytes live; 4 products without images, 1 broken link; DB role ivanprotsko
  11. ~/upready/memory/chrxnasdmds-olavka-deploy-topology.md — live rings olavka.ru (178.21.11.54,
      ssh alias cherkashina_store, containers olavka-prod-*) and paleoluma.com (Contabo, no local key)
  12. ~/upready/memory/chrxnasdmds-domains-cherkashino-2026-09-04.md — cherkashino.ru / черкашино.рф
      bought 2026-09-03, olavka.ru cannot be transferred (lives until 2027-07-19)
  13. ~/upready/memory/chrxnasdmds-checkout-legal-decisions.md — address step before delivery,
      no «other» payment, abstract shipping methods (courier/pickup), no carrier brand for the buyer
  14. ~/upready/memory/upready-store-abstract-dataset-and-seed-2026-09-12.md — seeding mechanics,
      media base STORE_MEDIA_BASE_URL (prod: https://shipshift.dev/static/store-profiles),
      deploy/scripts/sync-media.sh, handle/SKU suffix trap, price computation without STORE_PROFILE
  15. ~/upready/memory/upready-store-storefront-locale-address-contract-2026-09-12.md — locale/currency
      contract of the wave-2 track, NEXT_PUBLIC_* baked at build time
  16. ~/upready/memory/medusa-v2-sales-channel-gotcha.md
  Decisions already recorded (never re-ask): Stripe is out («у нас нет и не будет stripe», Ivan
  2026-09-03); Robokassa merchant OLAVKA has only the BankCard group + SBP, no wallets
  (Q-2026-08-31-10); checkout = address first, then delivery (Q-2026-09-03-01); tenant↔sales_channel
  and tenant↔api_key are module links (Q-2026-09-11-01); /tenants/* is the panel's backend
  (Q-2026-09-11-02). Before asking anything: node ~/upready/.ai/scripts/qa.mjs search "<topic>".

GUARD NOTE for the source project: the project-dir guard (rule 5k) blocks node/scripts whose cwd is
inside chrxnasdmds. Read its files with cat/sed/grep and query its DB from YOUR worktree. The
chrxnasdmds working tree is DIRTY (458 uncommitted paths on 2026-09-12, last commit ac94c1cd 6 days
ago): never stash, clean, checkout or commit there — read only. Its HANDOFF is not yours either.

STEP 1 — MEASURE THE SOURCE BEFORE ANY TRANSFER (numbers from queries, not from memory).
  DB: postgres://ivanprotsko@127.0.0.1:5433/medusa_chrxn, client /opt/homebrew/opt/postgresql@16/bin/psql
  (role ivanprotsko; the `medusa` role has no rights on product/image). Write
  artifacts/docs/2026-09-12-cherkashina-migration/00-source-measure.json — every number next to the
  exact SQL that produced it and the timestamp (date "+%Y-%m-%d %H:%M WITA").
  Acceptor's baseline 2026-09-12 08:5x WITA — RE-MEASURE, do not copy: product 38 (29 published,
  9 draft), product_variant 38 (exactly 1 per product), product_category 9 (flat, no parents),
  product_category_product 131, image 313 (273 relative `/products/…` → apps/storefront/public/products,
  40 absolute `http://localhost:9101/static/…` → apps/backend/static), products with thumbnail 34,
  product_collection 2, region 2, price rub 40 / usd 98 / eur 2, site_locale 2 (ru default + en),
  product_translation 51 (all `en`; columns product_handle, title, subtitle, description,
  short_characteristics, thumbnail, images), translation 2489 (ui en 910 / ru 910, review en 332 /
  ru 332, email 2+2, product el 1), home_banner 3, shipping_option 2, customer 46, order 88.
  Also count: blog/journal articles (table of modules/blog), courses, pickup_point_record,
  order_tracking, product metadata keys (metadata.i18n presence per product), image ranks per product.
  Then the LIVE rings, READ-ONLY: on olavka (ssh cherkashina_store, `docker exec olavka-prod-postgres
  psql … -c "select count(*) …"`) run the same counts. If the live DB differs from the local one in
  any count, stop the transfer and ask Ivan ONE question — which DB is the source of truth — with your
  recommendation. paleoluma.com (Contabo) has no local key: report it as unmeasured, do not guess.
  Never write to any production DB (17b).

STEP 2 — TASK 1: FEATURE INVENTORY → 01-feature-inventory.json (+ a readable 01-feature-inventory.md
  generated from it, rule 18b). One row per feature: {feature, source_files[], depends_on {env_keys[],
  packages[], patches[], tables[]}, exists_in_target: yes|partial|no, verdict: port_now|port_later|drop|
  ask_ivan, reason, effort}. Cover at least: ApiShip provider + carrier-abstraction provider +
  shipping-config module + store shipping routes + checkout pickup UI; Robokassa plugin + patch +
  success-return route + capture-payment route + payment UI + payment logos; locale module; translation
  module + product overrides; legal pages; home banners; blog/journal; courses + school; Telegram login
  and order notifications; Yandex ID auth; AI agent chat; loyalty plugin; Resend email; aspect-ratio
  subscriber (set-product-aspect); admin extensions of chrxnasdmds (src/admin).
  Target facts you must confirm by reading, not assume: apps/backend/medusa-config.ts of upready-store
  registers NO payment and NO fulfillment providers (Medusa defaults pp_system_default + manual
  fulfillment) — both integrations are net-new here. Source is Medusa 2.17.2, target 2.19.0: check the
  Robokassa plugin's peer range and that the pnpm patch still applies on 2.19 with `npm view` and a real
  install in your worktree, not from memory (feedback_build_vs_buy_escalation). Env keys exist in
  ~/upready/.env.keys as OLAVKA_ROBOKASSA_MERCHANT_LOGIN / _PASS_1 / _PASS_2 / _PASS_TEST_1 /
  _PASS_TEST_2 and APISHIP_PROD_TOKEN — never print their values.
  DESIGN FORK — ask Ivan before writing integration code: one backend serves every tenant, so
  per-tenant merchant credentials (Robokassa login/passwords, ApiShip token, sender address) cannot live
  in env the way chrxnasdmds does. Ask ONE question with a recommendation (e.g. provider options
  resolved per tenant at call time from a tenant-scoped secret record, bound to the tenant's region /
  sales channel; env keeps only what has nowhere else to live). Keep working on Step 3 while it is open
  (22e) — data migration does not depend on the answer.

STEP 3 — TASK 2: DATA MIGRATION with a registry → 02-mapping-registry.json (rule 18b; a generated
  .md view is welcome, the JSON is the record). One row per source entity: {kind, source_id,
  source_handle, target_id, target_handle, status: migrated|skipped|failed|pending, reason,
  checked_at}. Kinds: tenant, region, locale, category, collection, product, variant, price, category_link,
  image, product_translation, ui_translation, page, banner, plus anything you add under 2.4.
  Products (2.1): category membership (9 flat categories → tenant categories via
  /tenants/product-categories + links), prices per currency (rub/usd/eur → the tenant's regions; the
  wave-2 track decides currency-by-locale — read its handover on the mt-storefront-wave2 worktree,
  ask if the mapping is not obvious), localizations = product_translation rows + metadata.i18n
  (record which of the two each product used), status (published vs draft — keep drafts as drafts).
  Images: every image with its rank AND two per-product marks: `card_image` = product.thumbnail in
  chrxnasdmds (the list card) and `pdp_default_image` = the gallery image with rank 0 (first on the
  product page). In the target storefront the list card reads product.thumbnail and the product page
  opens `thumbnail || images[0]` (apps/storefront/src/modules/products/components/thumbnail/index.tsx)
  — so set thumbnail and image order explicitly, and verify both marks on the live storefront. Four
  products have no image and one has a broken link (memory 10): record them as-is, never invent
  images. Image bytes: reuse the 2026-09-06 export
  /Users/ivanprotsko/upready/projects/chrxnasdmds/artifacts/product-images-20260906/ (index.json,
  331 files, 115 MB) or the source folders; upload through the tenant's own path (POST /tenants/uploads
  or the media base STORE_MEDIA_BASE_URL — read both first); bytes stay out of git.
  Handles and SKUs: Medusa keeps them globally unique across tenants → the tenant copy carries a
  suffix (see the seed reference, item 4). Record old handle → new handle and old storefront URL → new
  URL for every product and category; a redirect table is a finding for Ivan, not something you deploy.
  Content pages (2.2): chrxnasdmds keeps them in three places — (a) legal markdown in
  apps/storefront/src/lib/legal/content/*.ts (privacy, offer, consent-pd, consent-marketing, returns,
  return-memo, contact) with {{PLACEHOLDER}} tokens — keep the tokens verbatim (rule 17a: requisites
  come from Ivan/Oksana, never invented); (b) UI-string pages (about, delivery, faq, wholesale, terms…)
  rendered from i18n keys + owner overrides in the `translation` table (resource ui, 910 keys × ru/en);
  (c) apps/backend/src/data/pages.json (39 legacy entries from the old Astro mirror; only
  pages/bundle-assortment has a route). Classify every page live|legacy by whether the storefront
  renders it today; migrate live pages into tenant_page {key, locale, title, body markdown, published}
  through POST /tenants/pages — one row per page per locale (ru, and en where a translation exists).
  Legacy pages: list them with a recommendation, do not migrate silently.
  Localizations (2.3): tenant locales = ru (default) + en (site_locale of the source). Do NOT touch
  STOREFRONT_DEFAULT_LOCALE / LOCALE_PIN / LOCALE_COUNTRY_MAP env: the acceptor has proposed moving
  them into the tenant document served by /storefront/by-host (decision pending with Ivan) — record the
  tenant's need (default ru) in the registry and the report.
  Home: 3 home_banner rows + hero → tenant_home_config.config via POST /tenants/home (read
  upsert-tenant-home and lib/data/tenant-home.ts for the shape).
  Everything else (2.4): list every remaining dataset with counts and a recommendation each —
  customers 46, orders 88, reviews (review translations 332), journal articles, courses/entitlements,
  loyalty balances, telegram identities, pickup datasets, order tracking. Customers and orders are NOT
  migrated by default: one question to Ivan with your recommendation.
  Mechanics: the import is a script under apps/backend/scripts/cherkashina-migration/ (idempotent,
  --dry-run, writes the registry as it goes, exits non-zero on any failed row) that talks to the
  /tenants/* HTTP API or the tenant workflows — never raw SQL into the target. Test it on a DB copy.

STEP 4 — LOCAL STAND (the «live product» for acceptance, 18f). Procedure and traps:
  ~/upready/memory/upready-store-local-stand-acceptance-2026-09-12.md. DB = a fresh copy
  `createdb -h 127.0.0.1 -p 5433 -T upready_store_mt upready_store_cherkashina` (never the acceptor's
  upready_store_abstract). Ports: 9031/8041/5182 are the acceptor's live stand, 9032/8042/5183 are
  reserved for track 2 — measure with lsof before binding, take the next free ones. Storefront `next
  dev` WITHOUT --turbopack (known 500, t-2026-09-12-turbopack-use-server-type-export), with
  DEMO_HOSTS=localhost and DEMO_TENANT_BASE_DOMAIN=localhost:<port>. Create the tenant through the real
  path (/start/onboarding or POST /tenants per onboarding-spec.md); proposed handle `cherkashino`
  (domains cherkashino.ru / черкашино.рф, memory 12) — the final name is Ivan's call at acceptance.
  Tenant storefront: http://<handle>.localhost:<port>/ru.

STEP 5 — REPORT → 03-migration-report.md: moved / not moved / why, source vs target counts side by
  side (same SQL on both), the tenant storefront URL Ivan opens himself, and frames (PNG outside git)
  of: home, catalog list (card images), one product page (default image), every migrated content page
  — at 1280×900 and 390×844. Acceptance is by the live storefront and DOM, never by the script log.
  Findings beyond the scope go into the report as proposals (title + acceptance criteria); tasks are
  created by Ivan only (22j). Deploy and prod DB only on Ivan's explicit command (17b/21c) — this
  session deploys nothing.

RULES OF THE SESSION: questions to Ivan as plain text, ONE at a time, each with a recommendation (22g);
never block the rest of the work on an open question (22e). Commits after each logical block:
  IVAN_OK=1 git add -- <literal paths> && git commit -q -m "feat(cherkashina-tenant): <what> (<task-id>)" -- <the same literal paths>
  (task id = the one Ivan assigns when approving this prompt; until then write `(pending-task-id)`).
Never rewrite history. HANDOFF only via `node ~/upready/.ai/scripts/handoff.mjs status set "…"`.
STOP AND ASK before: any write to a chrxnasdmds DB or repo; any write to prod; the per-tenant secrets
design; migrating customers/orders; deleting anything. Every timestamp you write is a fresh `date`
reading. End of every substantive turn: durable-save (commit + HANDOFF + memory note) and a «What's
next» section with a ready-to-paste prompt.
```
