/**
 * The Redis-backed infrastructure modules (audit 46df A-04).
 *
 * Without Redis, Medusa keeps its event bus, workflow engine and locks in
 * process memory, so a restart drops whatever was still in flight: an
 * `order.placed` whose subscribers had not run yet is simply gone. With
 * `REDIS_URL` set all four move to Redis, where a queued event or a workflow
 * step survives the restart and is picked up by the next process.
 *
 * The list mirrors the one `defineConfig` itself builds for a Redis deployment
 * (`resolveModules` in @medusajs/utils 2.19.0, dist/common/define-config.js,
 * the `process.env.REDIS_URL` branch), which is the only place in the framework
 * that names the locking provider. Every package here is a dependency of
 * `@medusajs/medusa` itself, so none has to be installed separately.
 *
 * Kept free of Medusa imports so `medusa-config.ts` and the unit test can both
 * load it.
 */

type Env = Record<string, string | undefined>;

// create-medusa-app writes REDIS_URL into every generated .env whether Redis runs
// or not, so development requires an explicit opt-in.
export const useRedis = (env: Env = process.env): boolean =>
  Boolean(env.REDIS_URL) && (env.NODE_ENV === "production" || env.USE_REDIS === "true");

export const redisModules = (env: Env = process.env) => {
  const redisUrl = env.REDIS_URL;

  return [
    {
      resolve: "@medusajs/medusa/cache-redis",
      options: { redisUrl: env.CACHE_REDIS_URL || redisUrl },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl },
    },
    {
      // `redis.url` still works in 2.19 but logs a deprecation warning on every
      // boot (@medusajs/workflow-engine-redis, dist/loaders/redis.js).
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl } },
    },
    {
      // Every lock the core flows take carries a ttl (10 s, or two minutes for
      // the longer ones), so a lock held by a process killed mid-workflow
      // expires on its own instead of blocking that cart for good.
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
  ];
};
