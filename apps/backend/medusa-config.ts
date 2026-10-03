import { defineConfig, loadEnv } from "@medusajs/framework/utils";
import { installStaticFileHeaders } from "./src/tenant-files/static-headers";
import { assertProductionEnv, cookieSecure, DEV_SECRET } from "./src/config/production-env";
import { redisModules, useRedis } from "./src/config/redis";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

// The framework mounts `static/` before it loads `src/api`, so this file is the
// last place that runs early enough to give those answers their headers.
installStaticFileHeaders();

const isProd = process.env.NODE_ENV === "production";

// Event bus, workflow engine, locks and cache on Redis once REDIS_URL is set in
// production (USE_REDIS=true opts development in): src/config/redis.ts.
const redisEnabled = useRedis();
const useSmtp = Boolean(process.env.SMTP_HOST);
const useS3 = isProd && Boolean(process.env.S3_BUCKET);

const smtpProvider = {
  resolve: "./src/modules/smtp-notification",
  id: "smtp",
  options: {
    channels: ["email"],
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    // Shown as the sender's name in the inbox, so the subject lines can stay
    // about the order alone.
    from_name: process.env.STORE_NAME,
    reply_to: process.env.SMTP_REPLY_TO,
  },
};

const s3Module = {
  resolve: "@medusajs/medusa/file",
  options: {
    providers: [
      {
        resolve: "@medusajs/medusa/file-s3",
        id: "s3",
        options: {
          file_url: `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`,
          access_key_id: process.env.S3_ACCESS_KEY,
          secret_access_key: process.env.S3_SECRET_KEY,
          region: process.env.S3_REGION,
          bucket: process.env.S3_BUCKET,
          endpoint: process.env.S3_ENDPOINT,
          additional_client_config: { forcePathStyle: true },
        },
      },
    ],
  },
};

// Without S3 the framework falls back to `@medusajs/file-local`, whose own
// default `backend_url` is `http://localhost:9000/static` — a dead address on
// every public storefront (measured 2026-09-14: a product image uploaded from
// the tenant panel was stored as `http://localhost:9000/static/tenants/…` and
// the browser answered ERR_CONNECTION_REFUSED, while the very same file WAS
// served under `https://shipshift.dev/static/…` with 200 image/webp). The
// provider is therefore declared explicitly, so the public base is a
// deployment value and not a library default. `src/tenant-files/index.ts`
// already reads these options off the container in preference to its own
// fallbacks — this entry is what it was written to find.
// Sign in with Yandex ID for storefront buyers (w02-yandex-id-auth).
//
// Two things about this block are load-bearing.
//
// 1. Naming the auth module here REPLACES Medusa's own registration of it.
//    `resolveModules` in @medusajs/utils/dist/common/define-config.js adds the
//    auth module with `providers: [{ resolve: "@medusajs/medusa/auth-emailpass",
//    id: "emailpass" }]`, and `transformModules` keys modules by service name
//    with the LAST entry winning, so the list below is the whole list. Drop
//    `emailpass` from it and every email-and-password login in the storefront
//    and in the owner panel stops working at once.
// 2. Yandex is registered only when its client id is present, the same shape
//    Redis, SMTP and S3 already use above and AGENTS.md asks new optional
//    infrastructure to keep. An install with no Yandex keys boots exactly as it
//    did before; turning the feature on is an .env change, not a code change.
//    A HALF-configured one (id present, secret or callback missing) fails at
//    boot through `YandexAuthService.validateOptions` rather than at a buyer's
//    consent screen.
const yandexClientId = process.env.YANDEX_CLIENT_ID;
const useYandexAuth = Boolean(yandexClientId);

const yandexAuthProvider = {
  resolve: "./src/modules/auth-yandex",
  id: "yandex",
  options: {
    clientId: yandexClientId,
    clientSecret: process.env.YANDEX_CLIENT_SECRET,
    callbackUrl: process.env.YANDEX_CALLBACK_URL,
    // The state is signed, not stored: see src/modules/auth-yandex/lib/state.ts
    // for why the framework's own state store cannot carry this flow.
    stateSecret:
      process.env.JWT_SECRET || process.env.COOKIE_SECRET || DEV_SECRET,
    allowedCallbackOrigins: (process.env.YANDEX_CALLBACK_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    scope: process.env.YANDEX_SCOPE || undefined,
    forceConfirm: process.env.YANDEX_FORCE_CONFIRM === "true",
  },
};

// Sign in with Telegram for storefront buyers (t-2026-10-02-telegram-auth).
//
// Registered UNCONDITIONALLY, the same reasoning `cdek`/`pochta` fulfillment
// providers already use above: the bot token is a per-tenant row
// (`tenant_integration_secret`, provider `telegram`), not a deployment secret,
// so the provider costs nothing until a shop has one — there is no
// `TELEGRAM_BOT_TOKEN` env var to gate on, unlike Yandex's client id.
const telegramAuthProvider = {
  resolve: "./src/modules/auth-telegram",
  id: "telegram",
  options: {
    authDateMaxAgeSec: process.env.TELEGRAM_AUTH_MAX_AGE_SEC
      ? Number(process.env.TELEGRAM_AUTH_MAX_AGE_SEC)
      : undefined,
  },
};

const authModule = {
  resolve: "@medusajs/medusa/auth",
  options: {
    providers: [
      { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
      ...(useYandexAuth ? [yandexAuthProvider] : []),
      telegramAuthProvider,
    ],
  },
};

const localFileModule = {
  resolve: "@medusajs/medusa/file",
  options: {
    providers: [
      {
        resolve: "@medusajs/medusa/file-local",
        id: "local",
        options: {
          upload_dir: process.env.LOCAL_FILE_UPLOAD_DIR || "static",
          backend_url:
            process.env.LOCAL_FILE_BACKEND_URL || "http://localhost:9000/static",
        },
      },
    ],
  },
};

// Production refuses to start without its secrets and CORS instead of falling
// back to `supersecret` / undefined (audit 2026-09-23, A-06/C-02). The dev
// defaults below only ever apply outside production.
assertProductionEnv();

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: { connection: { ssl: false } },
    redisUrl: redisEnabled ? process.env.REDIS_URL : undefined,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
      cookieSecret: process.env.COOKIE_SECRET || DEV_SECRET,
    },
    cookieOptions: {
      sameSite: "lax",
      // Closed by default in production, off on plain-http local runs
      // (audit 2026-09-23, A-03): src/config/production-env.ts.
      secure: cookieSecure(),
    },
  },
  featureFlags: {
    translation: true,
  },
  plugins: [
    {
      resolve: "@gorgo/medusa-integration",
      options: {
        encryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY,
        // Integration providers plug in here. Browse the catalog at
        // https://gorgojs.com/medusa/plugins?integrationModule=true or read
        // https://docs.gorgojs.com/medusa-modules/integration
        providers: [],
      },
    },
  ],
  modules: [
    { resolve: "@medusajs/medusa/translation" },
    // Naming the fulfillment module here replaces its default provider list,
    // so the manual provider (`manual_manual`, what every existing option
    // uses) is spelled out next to the tenant tariff provider
    // (`tariff_tariff`, src/modules/tariff-fulfillment): weight and
    // threshold tariffs a shop owner sets on /shipping in the panel.
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
          { resolve: "./src/modules/tariff-fulfillment", id: "tariff" },
          // CDEK (`cdek_cdek`, src/modules/cdek-fulfillment): prices a shipment
          // against the shop's OWN CDEK account, read per tenant from
          // `tenant_integration_secret`. Registered unconditionally because the
          // provider costs nothing until a shop has a row and a method
          // (i02-apiship-cdek-shipping).
          { resolve: "./src/modules/cdek-fulfillment", id: "cdek" },
          // Russian Post (`pochta_pochta`, src/modules/pochta-fulfillment): a
          // pickup-point method priced per shop from its own «Отправка» token,
          // read per tenant like CDEK's. Directory and tariff calls only, it
          // never creates a shipment (46df-pochta).
          { resolve: "./src/modules/pochta-fulfillment", id: "pochta" },
        ],
      },
    },
    // Buyer and owner authentication. `emailpass` is spelled out here because
    // this entry replaces Medusa's default one; Yandex ID joins it only when
    // YANDEX_CLIENT_ID is set, Telegram joins it unconditionally. See the
    // comments above `authModule`.
    authModule,
    // Shared multitenancy: tenant + tenant admin, actor type "tenant", /tenants/*.
    { resolve: "./src/modules/tenant" },
    // Product reviews, one row per (tenant, product, language) — t09-reviews.
    { resolve: "./src/modules/product-review" },
    // Online courses: course + lesson content, entitlement and progress — o24-courses.
    { resolve: "./src/modules/course" },
    // The signed-in customer's wishlist, one row per (tenant, customer, product) — t-cherk-32.
    { resolve: "./src/modules/wishlist" },
    // The platform's own pricing page (/pricing on the platform hosts), one
    // validated document edited in the admin at «Тарифы» — t-2026-09-25-08.
    { resolve: "./src/modules/platform-pricing" },
    // Wildberries Seller API mirror, read-only by construction — w01-wb-readonly-client.
    // The module owns the wb_* tables; the client is src/modules/wb/transport.ts,
    // the only file here that calls *.wildberries.ru, and it can send nothing
    // but the reads listed in src/modules/wb/endpoints.ts.
    { resolve: "./src/modules/wb" },
    // Ozon Seller API mirror, read-only by construction — w11-ozon-readonly-client.
    // The module owns the ozon_* tables; the client is src/modules/ozon/transport.ts,
    // and nothing in this repository can send Ozon anything but the reads listed in
    // src/modules/ozon/endpoints.ts. On Ozon the verb decides nothing (461 of 467
    // documented methods are POST), so the allow-list covers the whole registry and a
    // deny-list of known mutations fails module load on top.
    { resolve: "./src/modules/ozon" },
    // Which product of a shop is which listing on a marketplace — the pairing the
    // WB enrichment reads and writes (w07-tenant-catalog-enrich).
    { resolve: "./src/modules/marketplace-link" },

    // The marketplace READ core — w12-marketplace-core. Owns the normalized
    // mp_* layer every marketplace screen reads, the shared run log
    // (mp_sync_run) and the shared transport journal (mp_api_call). Next to
    // the models sit the adapter contract, the ONE registry of adapters
    // (src/modules/marketplace/registry.ts) and the shared validator every
    // adapter runs at load, so the read-only invariant applies to a new
    // marketplace automatically instead of being copied into it (rule 20).
    // It talks to no marketplace itself.
    { resolve: "./src/modules/marketplace" },

    // The marketplace WRITE core — w20-wb-write-core. Owns the gates, the
    // consent ledger (marketplace_write_consent) and the audit journal
    // (marketplace_write_audit). It sends nothing itself: an adapter brings a
    // registry of mutations and a `send`, and src/modules/marketplace-write/execute.ts
    // decides whether `send` is called at all. Wildberries is the first
    // adapter (src/modules/wb-write); Ozon is meant to be the second without
    // copying a gate (Ivan's order 2026-09-16 04:44 WITA).
    { resolve: "./src/modules/marketplace-write" },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: {
              name: "Local Notification Provider",
              channels: ["feed"],
            },
          },
          ...(useSmtp ? [smtpProvider] : []),
        ],
      },
    },
    ...(redisEnabled ? redisModules() : []),
    ...(useS3 ? [s3Module] : [localFileModule]),
    {
      // Payment. The framework registers the manual provider
      // (`pp_system_default`) on its own whatever this list says
      // (`@medusajs/payment` loaders/providers.js). Robokassa is one
      // registration for every shop: it carries no credentials here, they are
      // a per-tenant row resolved on each call
      // (`src/modules/payment-robokassa`, `src/tenant-secrets/`).
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment-robokassa",
            id: "robokassa",
          },
          {
            // Tribute, same per-tenant-row pattern (t-cherk-22).
            resolve: "./src/modules/payment-tribute",
            id: "tribute",
          },
        ],
      },
    },
  ],
});
