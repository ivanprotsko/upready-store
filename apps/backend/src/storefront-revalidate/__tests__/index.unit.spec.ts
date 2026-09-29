import { notifyStorefrontRevalidate } from "../index";

/**
 * A-15 (46df audit): a single dropped webhook used to leave the catalog cache
 * stale forever, with nothing else that would ever clear it before this
 * task's own `revalidate: 3600` ceiling. Two retries (three attempts total),
 * with a pause — long enough to ride out a storefront restart.
 */

// `process.env` stringifies whatever it is assigned — `env.X = undefined` sets
// the literal string `"undefined"`, not an absent key — so unsetting a
// variable needs an actual `delete`, both when applying and when restoring.
const setEnv = (env: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const withEnv = (
  vars: Record<string, string | undefined>,
  fn: () => Promise<void> | void
) => {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  setEnv(vars);
  return Promise.resolve(fn()).finally(() => setEnv(previous));
};

const response = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe("notifyStorefrontRevalidate", () => {
  it("does not retry a 2xx — one attempt, one call", async () => {
    await withEnv({ STOREFRONT_URL: "http://storefront.test", STOREFRONT_REVALIDATE_URL: undefined }, async () => {
      const fetchMock = jest.fn().mockResolvedValueOnce(response(200));
      const sleepMock = jest.fn().mockResolvedValue(undefined);

      const status = await notifyStorefrontRevalidate(
        { type: "product.updated", id: "prod_1" },
        { fetch: fetchMock as unknown as typeof fetch, sleep: sleepMock }
      );

      expect(status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleepMock).not.toHaveBeenCalled();
    });
  });

  it("retries a non-2xx up to three attempts total, pausing between each", async () => {
    await withEnv({ STOREFRONT_URL: "http://storefront.test", STOREFRONT_REVALIDATE_URL: undefined }, async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(response(503))
        .mockResolvedValueOnce(response(503))
        .mockResolvedValueOnce(response(503));
      const sleepMock = jest.fn().mockResolvedValue(undefined);

      const status = await notifyStorefrontRevalidate(
        { type: "product.updated", id: "prod_1" },
        { fetch: fetchMock as unknown as typeof fetch, sleep: sleepMock }
      );

      expect(status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(sleepMock).toHaveBeenCalledTimes(2);
    });
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    await withEnv({ STOREFRONT_URL: "http://storefront.test", STOREFRONT_REVALIDATE_URL: undefined }, async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(response(500))
        .mockResolvedValueOnce(response(200));
      const sleepMock = jest.fn().mockResolvedValue(undefined);

      const status = await notifyStorefrontRevalidate(
        { type: "product.updated", id: "prod_1" },
        { fetch: fetchMock as unknown as typeof fetch, sleep: sleepMock }
      );

      expect(status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleepMock).toHaveBeenCalledTimes(1);
    });
  });

  it("retries a thrown network error too, and answers null if every attempt throws", async () => {
    await withEnv({ STOREFRONT_URL: "http://storefront.test", STOREFRONT_REVALIDATE_URL: undefined }, async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const sleepMock = jest.fn().mockResolvedValue(undefined);

      const status = await notifyStorefrontRevalidate(
        { type: "product.updated", id: "prod_1" },
        { fetch: fetchMock as unknown as typeof fetch, sleep: sleepMock }
      );

      expect(status).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(sleepMock).toHaveBeenCalledTimes(2);
    });
  });

  it("never calls fetch, or sleep, with no storefront URL configured", async () => {
    await withEnv({ STOREFRONT_URL: undefined, STOREFRONT_REVALIDATE_URL: undefined }, async () => {
      const fetchMock = jest.fn();
      const sleepMock = jest.fn();

      const status = await notifyStorefrontRevalidate(
        { type: "product.updated" },
        { fetch: fetchMock as unknown as typeof fetch, sleep: sleepMock }
      );

      expect(status).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sleepMock).not.toHaveBeenCalled();
    });
  });
});
