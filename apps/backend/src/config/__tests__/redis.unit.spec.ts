import { redisModules, useRedis } from "../redis";

const REDIS_URL = "redis://mt-redis:6379";

describe("useRedis (audit 46df A-04)", () => {
  it("is on in production as soon as REDIS_URL is set", () => {
    expect(useRedis({ NODE_ENV: "production", REDIS_URL })).toBe(true);
  });

  it("is off in production without REDIS_URL", () => {
    expect(useRedis({ NODE_ENV: "production" })).toBe(false);
    expect(useRedis({ NODE_ENV: "production", REDIS_URL: "" })).toBe(false);
  });

  it("needs USE_REDIS=true outside production", () => {
    expect(useRedis({ NODE_ENV: "development", REDIS_URL })).toBe(false);
    expect(useRedis({ NODE_ENV: "development", REDIS_URL, USE_REDIS: "true" })).toBe(true);
  });
});

describe("redisModules (audit 46df A-04)", () => {
  const modules = redisModules({ NODE_ENV: "production", REDIS_URL });
  const byResolve = (resolve: string) => modules.find((module) => module.resolve === resolve);

  it("moves the event bus and the workflow engine to Redis", () => {
    expect(byResolve("@medusajs/medusa/event-bus-redis")?.options).toEqual({ redisUrl: REDIS_URL });
    expect(byResolve("@medusajs/medusa/workflow-engine-redis")?.options).toEqual({
      redis: { redisUrl: REDIS_URL },
    });
  });

  it("moves the locks to Redis as the default locking provider", () => {
    expect(byResolve("@medusajs/medusa/locking")?.options).toEqual({
      providers: [
        {
          resolve: "@medusajs/medusa/locking-redis",
          id: "locking-redis",
          is_default: true,
          options: { redisUrl: REDIS_URL },
        },
      ],
    });
  });

  it("puts the cache on CACHE_REDIS_URL when it is set, else on REDIS_URL", () => {
    expect(byResolve("@medusajs/medusa/cache-redis")?.options).toEqual({ redisUrl: REDIS_URL });

    const separate = redisModules({ REDIS_URL, CACHE_REDIS_URL: "redis://cache:6379" });
    expect(separate.find((module) => module.resolve === "@medusajs/medusa/cache-redis")?.options).toEqual({
      redisUrl: "redis://cache:6379",
    });
  });

  it("names only modules that resolve from @medusajs/medusa", () => {
    const names = modules.flatMap((module) => [
      module.resolve,
      ...((module.options as { providers?: { resolve: string }[] }).providers ?? []).map(
        (provider) => provider.resolve,
      ),
    ]);

    for (const name of names) {
      expect(() => require.resolve(name)).not.toThrow();
    }
  });
});
