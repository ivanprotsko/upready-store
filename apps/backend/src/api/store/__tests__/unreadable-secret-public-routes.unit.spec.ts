import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

jest.mock("../tenant/resolve-tenant", () => ({
  ...jest.requireActual("../tenant/resolve-tenant"),
  resolveTenantFromPublishableKey: jest.fn(async () => ({ id: "ten_1", sales_channel_id: "sc_1" })),
}));

import { deriveKey, encryptJson } from "../../../tenant-secrets/crypto";
import { GET as getCdekCities } from "../cdek/cities/route";
import { GET as getCdekPoints } from "../cdek/points/route";
import { pochtaContext } from "../pochta/helpers";
import { injectRobokassaTenant, robokassaAvailableFor, ROBOKASSA_PROVIDER_ID } from "../tenant/robokassa";

/**
 * 46df A-02: a buyer-facing route whose shop has a secret this deployment
 * cannot decrypt (a database restored under another `INTEGRATION_ENCRYPTION_KEY`)
 * answers as if the carrier or the payment method were not connected, never
 * 500, and logs one `warn` naming the tenant.
 */

const ENV_KEY = "INTEGRATION_ENCRYPTION_KEY";
const previousKey = process.env[ENV_KEY];

// Written under key A, read on a stand that runs key B.
const unreadablePayload = encryptJson({ account: "acc", password: "pwd" }, deriveKey("key-A-at-write-time"));

const pg = () => {
  const builder = {
    select: () => builder,
    where: () => builder,
    whereNull: () => builder,
    first: () =>
      Promise.resolve({
        id: "tis_1",
        tenant_id: "ten_1",
        provider: "any",
        payload: unreadablePayload,
        is_test: false,
        is_enabled: true,
      }),
  };
  return () => builder;
};

const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };

const request = (extra: Record<string, unknown> = {}) =>
  ({
    query: { q: "Москва", city: "Москва" },
    params: { id: "paycol_1" },
    scope: {
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.LOGGER ? logger : key === ContainerRegistrationKeys.PG_CONNECTION ? pg() : null,
    },
    ...extra,
  }) as never;

const response = () => {
  const res = { statusCode: 0, body: undefined as unknown, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
};

beforeAll(() => {
  process.env[ENV_KEY] = "key-B-on-this-stand";
});

afterAll(() => {
  if (previousKey === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = previousKey;
});

beforeEach(() => {
  logger.warn.mockClear();
});

const expectOneWarnForTenant = () => {
  expect(logger.warn).toHaveBeenCalledTimes(1);
  expect(logger.warn.mock.calls[0][0]).toContain("ten_1");
  expect(logger.warn.mock.calls[0][0]).not.toContain("key-A-at-write-time");
  expect(logger.warn.mock.calls[0][0]).not.toContain("key-B-on-this-stand");
};

describe("public store reads of an unreadable tenant secret", () => {
  it("GET /store/cdek/cities answers 200 «not configured»", async () => {
    const res = response();
    await getCdekCities(request(), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ cities: [], configured: false });
    expectOneWarnForTenant();
  });

  it("GET /store/cdek/points answers 200 «not configured»", async () => {
    const res = response();
    await getCdekPoints(request(), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ points: [], configured: false, city: null });
    expectOneWarnForTenant();
  });

  it("the Russian Post routes' context has no secret and no credentials", async () => {
    const context = await pochtaContext(request());

    expect(context.secret).toBeNull();
    expect(context.credentials).toBeNull();
    expectOneWarnForTenant();
  });

  it("Robokassa is not offered at checkout", async () => {
    expect(await robokassaAvailableFor(request())).toBe(false);
    expectOneWarnForTenant();
  });

  it("a Robokassa payment session gets the same 404 as a shop without Robokassa", async () => {
    const next = jest.fn();
    await expect(
      injectRobokassaTenant(request({ body: { provider_id: ROBOKASSA_PROVIDER_ID } }), response() as never, next),
    ).rejects.toMatchObject({ type: "not_found" });
    expect(next).not.toHaveBeenCalled();
    expectOneWarnForTenant();
  });
});
