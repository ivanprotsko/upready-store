import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { TENANT_MODULE } from "../../modules/tenant";

/**
 * t-cherk-22, part A: what `TRIBUTE_AVAILABLE` changes for the four answers
 * the store lead's brief names. With the switch not `true`:
 *
 * - `GET /tenants/tribute` answers `available: false`;
 * - `PUT /tenants/tribute` refuses with 403 and writes nothing;
 * - `GET /store/payment-providers` leaves `pp_tribute_tribute` out;
 * - a Tribute payment session is refused with the 404 a shop without a key gets.
 *
 * The routes and the middleware run for real. Stubbed are the tenant lookups
 * and the secret reads and writes, so a shop here always has a saved Tribute
 * key, and the switch alone decides. The key itself must never reach a
 * response or the log.
 */

jest.mock("../tenants/tenant-scope", () => ({
  ...jest.requireActual("../tenants/tenant-scope"),
  getTenantScope: async () => ({ id: "ten_trb" }),
}));

jest.mock("../store/tenant/robokassa", () => ({
  ...jest.requireActual("../store/tenant/robokassa"),
  tenantOrNull: async () => ({ id: "ten_trb", sales_channel_id: "sc_trb" }),
}));

jest.mock("../../tenant-secrets/tribute", () => ({
  ...jest.requireActual("../../tenant-secrets/tribute"),
  readTributeSecret: jest.fn(),
  readTributeSecretPublic: jest.fn(),
}));

jest.mock("../../tenant-secrets/slot", () => ({
  ...jest.requireActual("../../tenant-secrets/slot"),
  writeTenantSecretSlot: jest.fn(),
  deleteTenantSecretSlot: jest.fn(),
}));

jest.mock("../../tenant-secrets/robokassa", () => ({
  ...jest.requireActual("../../tenant-secrets/robokassa"),
  readRobokassaSecretPublic: async () => null,
}));

jest.mock("../../tenant-secrets/btcpay", () => ({
  ...jest.requireActual("../../tenant-secrets/btcpay"),
  readBtcpaySecretPublic: async () => null,
}));

jest.mock("../../tenant-secrets/bitcart", () => ({
  ...jest.requireActual("../../tenant-secrets/bitcart"),
  readBitcartSecretPublic: async () => null,
}));

jest.mock("../../tenant-secrets/x402", () => ({
  ...jest.requireActual("../../tenant-secrets/x402"),
  readX402SecretPublic: async () => null,
}));

import { DELETE, GET, PUT } from "../tenants/tribute/route";
import { GET as listPaymentProviders } from "../store/payment-providers/route";
import { injectTributeTenant, TRIBUTE_PROVIDER_ID } from "../store/tenant/tribute";

const secrets = jest.requireMock("../../tenant-secrets/tribute") as {
  readTributeSecret: jest.Mock;
  readTributeSecretPublic: jest.Mock;
};
const slot = jest.requireMock("../../tenant-secrets/slot") as {
  writeTenantSecretSlot: jest.Mock;
  deleteTenantSecretSlot: jest.Mock;
};

const FLAG = "TRIBUTE_AVAILABLE";
const API_KEY = "trbt_saved_key_7f3a9c21";
const NEW_API_KEY = "trbt_typed_key_51d0e8b4";

const SECRET = {
  id: "tis_trb",
  tenant_id: "ten_trb",
  is_enabled: true,
  credentials: { api_key: API_KEY, shop_id: null },
};

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const query = {
  graph: jest.fn(async ({ entity }: { entity: string }) =>
    entity === "payment_collection"
      ? { data: [{ id: "paycol_1", cart: { id: "cart_1", sales_channel_id: "sc_trb" } }] }
      : { data: [{ metadata: null }] },
  ),
};

/** The region offers both providers, the way `link-tribute-regions.ts` leaves a RUB region. */
const remoteQuery = jest.fn(async () => ({
  rows: [
    { payment_provider: { id: TRIBUTE_PROVIDER_ID, is_enabled: true } },
    { payment_provider: { id: "pp_system_default", is_enabled: true } },
  ],
  metadata: { count: 2, skip: 0, take: 20 },
}));

const scope = {
  resolve: (key: string) => {
    switch (key) {
      case ContainerRegistrationKeys.PG_CONNECTION:
        return {};
      case ContainerRegistrationKeys.LOGGER:
        return logger;
      case ContainerRegistrationKeys.QUERY:
        return query;
      case ContainerRegistrationKeys.REMOTE_QUERY:
        return remoteQuery;
      case TENANT_MODULE:
        return {};
      default:
        throw new Error(`unexpected resolve(${key})`);
    }
  },
};

const panelRequest = (validatedBody: Record<string, unknown> = {}) =>
  ({ scope, validatedBody, get: () => undefined, protocol: "https" }) as never;

const response = () => {
  const res = { json: jest.fn() };
  return { res, body: () => res.json.mock.calls[0]?.[0] as Record<string, unknown> };
};

/** Everything the key could have leaked into: every response body and every log line. */
const leaked = (bodies: unknown[]): string =>
  JSON.stringify([
    bodies,
    logger.info.mock.calls,
    logger.warn.mock.calls,
    logger.error.mock.calls,
    logger.debug.mock.calls,
  ]);

const previousFlag = process.env[FLAG];
const previousOrigin = process.env.BACKEND_PUBLIC_URL;

beforeAll(() => {
  process.env.BACKEND_PUBLIC_URL = "https://api.example.test";
});

beforeEach(() => {
  jest.clearAllMocks();
  secrets.readTributeSecret.mockResolvedValue(SECRET);
  secrets.readTributeSecretPublic.mockResolvedValue(SECRET);
  slot.writeTenantSecretSlot.mockResolvedValue(undefined);
  slot.deleteTenantSecretSlot.mockResolvedValue({ id: SECRET.id, deleted: true });
  delete process.env[FLAG];
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
  if (previousOrigin === undefined) delete process.env.BACKEND_PUBLIC_URL;
  else process.env.BACKEND_PUBLIC_URL = previousOrigin;
});

describe("GET /tenants/tribute", () => {
  it.each([
    ["unset", undefined, false],
    ["`false`", "false", false],
    ["`true`", "true", true],
  ])("answers available as the switch says when it is %s", async (_label, value, available) => {
    if (value !== undefined) process.env[FLAG] = value;
    const { res, body } = response();

    await GET(panelRequest(), res as never);

    expect(body()).toMatchObject({
      provider: "tribute",
      available,
      callback_url: "https://api.example.test/tribute/webhook/ten_trb",
      settings: { is_enabled: true, api_key: { set: true, last4: API_KEY.slice(-4) } },
    });
    expect(leaked([body()])).not.toContain(API_KEY);
  });
});

describe("PUT /tenants/tribute", () => {
  it.each([undefined, "false", "1"])("refuses with 403 and writes nothing when the switch is %p", async (value) => {
    if (value !== undefined) process.env[FLAG] = value;
    const { res } = response();

    const error = await PUT(panelRequest({ api_key: NEW_API_KEY, is_enabled: true }), res as never).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MedusaError);
    expect(error).toMatchObject({ type: MedusaError.Types.FORBIDDEN });
    expect((error as Error).message).toContain("TRIBUTE_AVAILABLE");
    expect((error as Error).message).not.toContain(NEW_API_KEY);
    expect(slot.writeTenantSecretSlot).not.toHaveBeenCalled();
    expect(secrets.readTributeSecret).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("saves the typed key where the switch is `true`, and answers with its mask only", async () => {
    process.env[FLAG] = "true";
    const { res, body } = response();

    await PUT(panelRequest({ api_key: NEW_API_KEY, is_enabled: true }), res as never);

    expect(slot.writeTenantSecretSlot).toHaveBeenCalledTimes(1);
    expect(slot.writeTenantSecretSlot.mock.calls[0][2]).toMatchObject({
      tenantId: "ten_trb",
      provider: "tribute",
      credentials: { api_key: NEW_API_KEY, shop_id: null },
      isEnabled: true,
    });
    expect(body()).toMatchObject({ available: true, settings: { api_key: { set: true } } });
    expect(leaked([body()])).not.toContain(NEW_API_KEY);
    expect(leaked([body()])).not.toContain(API_KEY);
  });
});

describe("DELETE /tenants/tribute", () => {
  it("still removes a saved key where the switch is off", async () => {
    const { res, body } = response();

    await DELETE(panelRequest(), res as never);

    expect(slot.deleteTenantSecretSlot).toHaveBeenCalledWith({}, {}, "ten_trb", "tribute");
    expect(body()).toMatchObject({ available: false, deleted: true });
    expect(leaked([body()])).not.toContain(API_KEY);
  });
});

describe("GET /store/payment-providers", () => {
  const storeRequest = () =>
    ({
      scope,
      filterableFields: { region_id: "reg_1" },
      queryConfig: { fields: ["id", "is_enabled"], pagination: { skip: 0, take: 20 } },
    }) as never;

  it("leaves Tribute out where the switch is off, even for a shop with a saved key", async () => {
    const { res, body } = response();

    await listPaymentProviders(storeRequest(), res as never);

    const ids = (body().payment_providers as Array<{ id: string }>).map((provider) => provider.id);
    expect(ids).not.toContain(TRIBUTE_PROVIDER_ID);
    // With Tribute gone the shop has no real method left, so the demo card stays.
    expect(ids).toEqual(["pp_system_default"]);
    expect(body().count).toBe(1);
  });

  it("offers Tribute where the switch is `true`", async () => {
    process.env[FLAG] = "true";
    const { res, body } = response();

    await listPaymentProviders(storeRequest(), res as never);

    const ids = (body().payment_providers as Array<{ id: string }>).map((provider) => provider.id);
    expect(ids).toEqual([TRIBUTE_PROVIDER_ID]);
    expect(body().count).toBe(1);
  });
});

describe("creating a Tribute payment session", () => {
  const sessionRequest = () =>
    ({
      scope,
      params: { id: "paycol_1" },
      body: { provider_id: TRIBUTE_PROVIDER_ID, data: { success_url: "https://shop.test/s" } },
    }) as never;

  const refusal = async () => {
    const next = jest.fn();
    const error = await Promise.resolve(injectTributeTenant(sessionRequest(), {} as never, next)).catch(
      (thrown: unknown) => thrown,
    );
    return { error, next };
  };

  it("answers as for a shop without a key where the switch is off", async () => {
    process.env[FLAG] = "true";
    secrets.readTributeSecretPublic.mockResolvedValue(null);
    const withoutKey = await refusal();

    delete process.env[FLAG];
    secrets.readTributeSecretPublic.mockResolvedValue(SECRET);
    const switchedOff = await refusal();

    expect(withoutKey.error).toMatchObject({ type: MedusaError.Types.NOT_FOUND });
    expect(switchedOff.error).toMatchObject({
      type: (withoutKey.error as MedusaError).type,
      message: (withoutKey.error as Error).message,
    });
    expect(switchedOff.next).not.toHaveBeenCalled();
    expect(query.graph).not.toHaveBeenCalled();
  });

  it("passes the session on with the server's tenant where the switch is `true`", async () => {
    process.env[FLAG] = "true";
    const req = sessionRequest() as unknown as { body: { data: Record<string, unknown> } };
    const next = jest.fn();

    await injectTributeTenant(req as never, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.data).toEqual({ success_url: "https://shop.test/s", tenant_id: "ten_trb" });
  });
});
