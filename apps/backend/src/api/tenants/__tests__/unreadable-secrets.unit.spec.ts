import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { deriveKey, encryptJson, ENCRYPTION_KEY_ENV } from "../../../tenant-secrets/crypto";
import { TENANT_MODULE } from "../../../modules/tenant";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";

/**
 * 46df D1, the panel half: the shop's rows of `tenant_integration_secret` are
 * encrypted under the LIVE key and read under the stand's, exactly as on every
 * stand made from the live snapshot. Before the fix each read below threw
 * «Unsupported state or unable to authenticate data» and the route answered
 * 500; the owner could neither see the page nor delete the row.
 *
 * The routes run for real against a fake connection that holds the rows;
 * only the tenant lookup, the warehouse lookup and the CDEK provisioning
 * workflow are stubbed, because none of them touches a secret.
 */

jest.mock("../tenant-scope", () => ({
  ...jest.requireActual("../tenant-scope"),
  getTenantScope: async () => ({ id: "ten_46df" }),
}));

jest.mock("../shipping-methods/helpers", () => ({
  ...jest.requireActual("../shipping-methods/helpers"),
  getTenantWarehouse: async () => ({
    service_zone_ids: [],
    base_service_zone_id: "serzo_46df",
    stock_location_id: "sloc_46df",
    default_weight_g: 500,
  }),
  resolveShippingProfileId: async () => "sp_46df",
}));

jest.mock("../../../workflows/tenant/cdek/provision-tenant-cdek-methods", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __esModule: true, __run: run, default: () => ({ run }) };
});

jest.mock("../../../modules/marketplace/project", () => ({
  ...jest.requireActual("../../../modules/marketplace/project"),
  tenantVariants: async () => [],
}));

import {
  DELETE as deletePaymentSettings,
  GET as getPaymentSettings,
  PUT as putPaymentSettings,
} from "../payment-settings/route";
import {
  DELETE as deleteDeliverySettings,
  GET as getDeliverySettings,
} from "../delivery-settings/route";
import { GET as getMarketplaces } from "../marketplaces/route";
import { deleteMarketplaceKey, getMarketplaceKey, putMarketplaceKey } from "../marketplace-keys";

const { __run: provisionRun } = jest.requireMock(
  "../../../workflows/tenant/cdek/provision-tenant-cdek-methods",
) as { __run: jest.Mock };

type Row = {
  id: string;
  tenant_id: string;
  provider: string;
  payload: string;
  is_test: boolean;
  is_enabled: boolean;
  updated_at: Date | null;
  deleted_at: Date | null;
};

const LIVE_KEY = deriveKey("live-key");

const liveRow = (provider: string, payload: Record<string, unknown>, over: Partial<Row> = {}): Row => ({
  id: `tis_46df_${provider}`,
  tenant_id: "ten_46df",
  provider,
  payload: encryptJson(payload, LIVE_KEY),
  is_test: true,
  is_enabled: true,
  updated_at: null,
  deleted_at: null,
  ...over,
});

/**
 * The connection: the query shapes the readers and the slot writer use, over
 * an array of rows. `orderByRaw` is the writer's «live row first»; the array
 * here never holds a live and a deleted row of one slot at once, so it is a
 * no-op.
 */
const fakePg = (rows: Row[]) => (_table: string) => {
  let found = rows;
  const chain = {
    select: () => chain,
    where: (filter: Record<string, unknown>) => {
      found = found.filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key as keyof Row] === value),
      );
      return chain;
    },
    whereNull: (column: keyof Row) => {
      found = found.filter((row) => row[column] === null);
      return chain;
    },
    orderByRaw: () => chain,
    first: async () => found[0],
    update: async (patch: Partial<Row>) => {
      found.forEach((row) => Object.assign(row, patch));
      return found.length;
    },
  };
  return chain;
};

/** The tenant module's three secret methods, writing into the same rows. */
const fakeStore = (rows: Row[]) => ({
  createTenantIntegrationSecrets: jest.fn(async (data: Partial<Row>) => {
    const row = { ...liveRow("new", {}), ...data, id: `tis_new_${rows.length}` } as Row;
    rows.push(row);
    return row;
  }),
  updateTenantIntegrationSecrets: jest.fn(async (data: Partial<Row> & { id: string }) => {
    const row = rows.find((entry) => entry.id === data.id);
    Object.assign(row!, data);
    return row;
  }),
  softDeleteTenantIntegrationSecrets: jest.fn(async (ids: string[]) => {
    rows.filter((row) => ids.includes(row.id)).forEach((row) => (row.deleted_at = new Date()));
  }),
});

const emptyMarketplaceService = () =>
  new Proxy(
    {},
    {
      get: (_target, name: string) =>
        name.startsWith("list") ? async () => [] : async () => ({}),
    },
  );

const setup = (rows: Row[], validatedBody?: unknown) => {
  const store = fakeStore(rows);
  const warn = jest.fn();
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.PG_CONNECTION]: fakePg(rows),
    [ContainerRegistrationKeys.LOGGER]: { warn, info: jest.fn(), error: jest.fn() },
    [ContainerRegistrationKeys.QUERY]: { graph: async () => ({ data: [{ metadata: null }] }) },
    [TENANT_MODULE]: store,
    [MARKETPLACE_MODULE]: emptyMarketplaceService(),
  };
  const scope = {
    resolve: (key: string) => {
      if (!(key in services)) {
        throw new Error(`test scope has no ${key}`);
      }
      return services[key];
    },
  };
  const req = {
    scope,
    validatedBody,
    params: {},
    protocol: "http",
    get: (header: string) => (header === "host" ? "localhost:9000" : undefined),
  };
  let body: Record<string, any> | undefined;
  const res = {
    json: (value: Record<string, any>) => {
      body = value;
      return res;
    },
    status: () => res,
  };
  return { req: req as never, res: res as never, store, warn, body: () => body! };
};

const robokassaPayload = {
  merchant_login: "DEMO",
  password1: "live-one",
  password2: "live-two",
  test_password1: "test-one",
  test_password2: "test-two",
  hash_algorithm: "sha256",
};

const cdekPayload = {
  account: "acc",
  password: "pwd",
  test_account: "tacc",
  test_password: "tpwd",
  sender_mode: "warehouse",
  sender_city_code: 44,
  sender_city_name: "Москва",
  sender_address: null,
  sender_name: null,
  sender_phone: null,
  shipment_point: null,
  webhook_token: "0123456789abcdef0123456789abcdef",
  webhook_uuid: null,
};

const previousKey = process.env[ENCRYPTION_KEY_ENV];

beforeEach(() => {
  process.env[ENCRYPTION_KEY_ENV] = "stand-key";
  provisionRun.mockClear();
});

afterAll(() => {
  if (previousKey === undefined) {
    delete process.env[ENCRYPTION_KEY_ENV];
  } else {
    process.env[ENCRYPTION_KEY_ENV] = previousKey;
  }
});

describe("/tenants/payment-settings with a Robokassa row the stand cannot decrypt", () => {
  it("GET answers with the row marked unreadable, Robokassa off for the buyer", async () => {
    const rows = [liveRow("robokassa", robokassaPayload, { is_test: false })];
    const call = setup(rows);

    await getPaymentSettings(call.req, call.res);

    expect(call.body()).toMatchObject({
      settings: null,
      unreadable: { id: "tis_46df_robokassa", provider: "robokassa", is_test: false, is_enabled: true },
      methods: { robokassa: false },
    });
    expect(call.warn).toHaveBeenCalledTimes(1);
  });

  it("PUT refuses a save without passwords by naming them, not with a 500", async () => {
    const rows = [liveRow("robokassa", robokassaPayload)];
    const call = setup(rows, { provider: "robokassa", merchant_login: "DEMO" });

    await expect(putPaymentSettings(call.req, call.res)).rejects.toMatchObject({
      type: "invalid_data",
      message: expect.stringContaining("test_password1 and test_password2"),
    });
    expect(call.store.updateTenantIntegrationSecrets).not.toHaveBeenCalled();
  });

  it("PUT overwrites the same row with what the owner typed, and it reads back", async () => {
    const rows = [liveRow("robokassa", robokassaPayload)];
    const call = setup(rows, {
      provider: "robokassa",
      merchant_login: "DEMO",
      test_password1: "new-test-one",
      test_password2: "new-test-two",
    });

    await putPaymentSettings(call.req, call.res);

    expect(call.store.createTenantIntegrationSecrets).not.toHaveBeenCalled();
    expect(call.store.updateTenantIntegrationSecrets).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tis_46df_robokassa", is_test: true, is_enabled: true }),
    );
    expect(call.body()).toMatchObject({
      unreadable: null,
      settings: { id: "tis_46df_robokassa", test_password2: { set: true, last4: "-two" } },
      methods: { robokassa: true },
    });
  });

  it("DELETE removes the row by id without reading it", async () => {
    const rows = [liveRow("robokassa", robokassaPayload)];
    const call = setup(rows);

    await deletePaymentSettings(call.req, call.res);

    expect(call.store.softDeleteTenantIntegrationSecrets).toHaveBeenCalledWith(["tis_46df_robokassa"]);
    expect(call.body()).toEqual({ id: "tis_46df_robokassa", object: "payment_settings", deleted: true });
  });
});

describe("/tenants/delivery-settings with a CDEK row the stand cannot decrypt", () => {
  it("GET answers with the row marked unreadable and no webhook URL built from a lost token", async () => {
    const rows = [liveRow("cdek", cdekPayload)];
    const call = setup(rows);

    await getDeliverySettings(call.req, call.res);

    expect(call.body()).toMatchObject({
      settings: null,
      unreadable: { id: "tis_46df_cdek", provider: "cdek" },
      webhook_url: null,
    });
  });

  it("DELETE removes the row by id and switches the CDEK methods off", async () => {
    const rows = [liveRow("cdek", cdekPayload)];
    const call = setup(rows);

    await deleteDeliverySettings(call.req, call.res);

    expect(call.store.softDeleteTenantIntegrationSecrets).toHaveBeenCalledWith(["tis_46df_cdek"]);
    expect(provisionRun).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ enabled: false, kinds: [] }) }),
    );
    expect(call.body()).toEqual({ id: "tis_46df_cdek", object: "delivery_settings", deleted: true });
  });
});

describe("marketplace keys with a Wildberries row the stand cannot decrypt", () => {
  it("GET /tenants/marketplaces answers every card, the WB one marked unreadable", async () => {
    const rows = [liveRow("wildberries", { api_key: "wb-token-value" })];
    const call = setup(rows);

    await getMarketplaces(call.req, call.res);

    const cards = call.body().marketplaces as Array<{ id: string; connection: { key: unknown } }>;
    expect(cards.find((card) => card.id === "wb")?.connection.key).toMatchObject({
      set: false,
      last4: null,
      unreadable: true,
    });
    expect(cards.filter((card) => card.id !== "wb").map((card) => card.connection.key)).toEqual(
      expect.arrayContaining([expect.objectContaining({ unreadable: false })]),
    );
  });

  it("the key route reads it as unreadable, saves over it and deletes it by id", async () => {
    const rows = [liveRow("wildberries", { api_key: "wb-token-value" })];

    const read = setup(rows);
    await getMarketplaceKey(read.req, read.res, "wb");
    expect(read.body().connection.key).toEqual({ set: false, last4: null, unreadable: true });

    const empty = setup(rows, {});
    await expect(putMarketplaceKey(empty.req, empty.res, "wb")).rejects.toMatchObject({
      type: "invalid_data",
    });

    const save = setup(rows, { api_key: "fresh-wb-token" });
    await putMarketplaceKey(save.req, save.res, "wb");
    expect(save.store.updateTenantIntegrationSecrets).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tis_46df_wildberries" }),
    );

    // The saved row is readable now; put the unreadable one back to prove the
    // delete never needs the payload.
    rows[0].payload = encryptJson({ api_key: "wb-token-value" }, LIVE_KEY);
    const remove = setup(rows);
    await deleteMarketplaceKey(remove.req, remove.res, "wb");
    expect(remove.store.softDeleteTenantIntegrationSecrets).toHaveBeenCalledWith([
      "tis_46df_wildberries",
    ]);
  });
});
