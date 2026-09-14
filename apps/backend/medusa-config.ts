import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const isProd = process.env.NODE_ENV === "production";
const redisUrl = process.env.REDIS_URL;

// create-medusa-app writes REDIS_URL into every generated .env whether Redis runs
// or not, so development requires an explicit opt-in.
const useRedis = Boolean(redisUrl) && (isProd || process.env.USE_REDIS === "true");
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

const redisModules = [
  {
    resolve: "@medusajs/medusa/cache-redis",
    options: { redisUrl: process.env.CACHE_REDIS_URL || redisUrl },
  },
  {
    resolve: "@medusajs/medusa/event-bus-redis",
    options: { redisUrl },
  },
  {
    resolve: "@medusajs/medusa/workflow-engine-redis",
    options: { redis: { url: redisUrl } },
  },
];

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

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: { connection: { ssl: false } },
    redisUrl: useRedis ? redisUrl : undefined,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
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
        ],
      },
    },
    // Shared multitenancy: tenant + tenant admin, actor type "tenant", /tenants/*.
    { resolve: "./src/modules/tenant" },
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
    ...(useRedis ? redisModules : []),
    ...(useS3 ? [s3Module] : [localFileModule]),
  ],
});
