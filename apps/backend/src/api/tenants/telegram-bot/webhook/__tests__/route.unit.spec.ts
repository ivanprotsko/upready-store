import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { decryptJson, deriveKey, encryptJson, ENCRYPTION_KEY_ENV } from "../../../../../tenant-secrets/crypto";
import { TENANT_MODULE } from "../../../../../modules/tenant";

/**
 * `POST|DELETE /tenants/telegram-bot/webhook` (t-cherk-23). Same shape of test
 * as `../../__tests__/unreadable-secrets.unit.spec.ts`: the slot writer runs
 * for real against a fake connection; only Telegram itself (`bot-api`) and the
 * tenant lookup (`tenant-scope`) are stubbed, because neither touches a
 * secret. `shop-bot/router` is mocked `{ virtual: true }` — another agent of
 * this same task writes it alongside this route, so the test does not depend
 * on file order between the two.
 */

jest.mock("../../../tenant-scope", () => ({
  ...jest.requireActual("../../../tenant-scope"),
  getTenantScope: async () => ({ id: "ten_cherk23", name: "Cherkashina", handle: "cherkashinao", sales_channel_id: null }),
}));

const setWebhook = jest.fn();
const deleteWebhook = jest.fn();
const setMyCommands = jest.fn();

jest.mock("../../../../../telegram/bot-api", () => {
  const actual = jest.requireActual("../../../../../telegram/bot-api");
  return {
    ...actual,
    createBotApi: jest.fn(() => ({
      setWebhook,
      deleteWebhook,
      setMyCommands,
    })),
  };
});

jest.mock(
  "../../../../../shop-bot/router",
  () => ({
    SHOP_BOT_COMMANDS: (locale: "ru" | "en") => [
      { command: "start", description: locale === "ru" ? "Открыть магазин" : "Open the shop" },
    ],
  }),
  { virtual: true },
);

import { createBotApi, TelegramBotApiError } from "../../../../../telegram/bot-api";
import { DELETE as deleteWebhookRoute, POST as postWebhook } from "../route";

type Row = {
  id: string;
  tenant_id: string;
  provider: string;
  payload: string;
  is_test: boolean;
  is_enabled: boolean;
  deleted_at: Date | null;
};

const KEY = deriveKey("test-key");

const telegramRow = (credentials: Record<string, unknown>, over: Partial<Row> = {}): Row => ({
  id: "tis_cherk23_telegram",
  tenant_id: "ten_cherk23",
  provider: "telegram",
  payload: encryptJson(credentials, KEY),
  is_test: false,
  is_enabled: true,
  deleted_at: null,
  ...over,
});

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
  };
  return chain;
};

const fakeStore = (rows: Row[]) => ({
  createTenantIntegrationSecrets: jest.fn(async (data: Partial<Row>) => {
    const row = { ...telegramRow({}), ...data, id: `tis_new_${rows.length}` } as Row;
    rows.push(row);
    return row;
  }),
  updateTenantIntegrationSecrets: jest.fn(async (data: Partial<Row> & { id: string }) => {
    const row = rows.find((entry) => entry.id === data.id);
    Object.assign(row!, data);
    return row;
  }),
  softDeleteTenantIntegrationSecrets: jest.fn(async () => {}),
});

const setup = (rows: Row[]) => {
  const store = fakeStore(rows);
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.PG_CONNECTION]: fakePg(rows),
    [TENANT_MODULE]: store,
  };
  const scope = {
    resolve: (key: string) => {
      if (!(key in services)) {
        throw new Error(`test scope has no ${key}`);
      }
      return services[key];
    },
  };
  const req = { scope, params: {} };
  let body: Record<string, any> | undefined;
  const res = {
    json: (value: Record<string, any>) => {
      body = value;
      return res;
    },
  };
  return { req: req as never, res: res as never, store, body: () => body! };
};

const previousKey = process.env[ENCRYPTION_KEY_ENV];
const previousBackendUrl = process.env.BACKEND_PUBLIC_URL;

beforeEach(() => {
  process.env[ENCRYPTION_KEY_ENV] = "test-key";
  process.env.BACKEND_PUBLIC_URL = "https://cherkashinao.upready.dev";
  setWebhook.mockReset().mockResolvedValue({ ok: true, result: true, ms: 1 });
  deleteWebhook.mockReset().mockResolvedValue({ ok: true, result: true, ms: 1 });
  setMyCommands.mockReset().mockResolvedValue({ ok: true, result: true, ms: 1 });
  (createBotApi as jest.Mock).mockClear();
});

afterAll(() => {
  if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
  else process.env[ENCRYPTION_KEY_ENV] = previousKey;
  if (previousBackendUrl === undefined) delete process.env.BACKEND_PUBLIC_URL;
  else process.env.BACKEND_PUBLIC_URL = previousBackendUrl;
});

describe("POST /tenants/telegram-bot/webhook", () => {
  it("sets the webhook with the public URL, the secret and allowed_updates, then writes the slot", async () => {
    const rows = [telegramRow({ username: "cherkashinao_bot", token: "123:abc" })];
    const call = setup(rows);

    await postWebhook(call.req, call.res);

    expect(setWebhook).toHaveBeenCalledTimes(1);
    const args = setWebhook.mock.calls[0][0];
    expect(args.url).toBe("https://cherkashinao.upready.dev/telegram/bot/cherkashinao/webhook");
    expect(typeof args.secret_token).toBe("string");
    expect(args.secret_token.length).toBeGreaterThan(0);
    expect(args.allowed_updates).toEqual(["message", "callback_query", "inline_query"]);
    expect(setMyCommands).toHaveBeenCalledWith([{ command: "start", description: "Открыть магазин" }]);

    expect(call.store.updateTenantIntegrationSecrets).toHaveBeenCalledTimes(1);
    const written = decryptJson<Record<string, unknown>>(
      (call.store.updateTenantIntegrationSecrets as jest.Mock).mock.calls[0][0].payload,
      KEY,
    );
    expect(written).toMatchObject({ username: "cherkashinao_bot", token: "123:abc" });
    expect(typeof written.webhook_secret).toBe("string");

    expect(call.body()).toMatchObject({ bot: { webhook_connected: true } });
  });

  it("keeps the existing manager_chat_id across a re-provision", async () => {
    const rows = [
      telegramRow({
        username: "cherkashinao_bot",
        token: "123:abc",
        webhook_secret: "old-secret",
        manager_chat_id: 777,
      }),
    ];
    const call = setup(rows);

    await postWebhook(call.req, call.res);

    const decrypted = decryptJson<Record<string, unknown>>(rows[0].payload, KEY);
    expect(decrypted.manager_chat_id).toBe(777);
    expect(decrypted.webhook_secret).not.toBe("old-secret");
  });

  it("answers 400 with Telegram's own description and never writes the slot", async () => {
    setWebhook.mockRejectedValue(
      new TelegramBotApiError("setWebhook", 401, "Unauthorized", 1),
    );
    const rows = [telegramRow({ username: "cherkashinao_bot", token: "bad-token" })];
    const call = setup(rows);

    await expect(postWebhook(call.req, call.res)).rejects.toMatchObject({
      type: "invalid_data",
      message: expect.stringContaining("Unauthorized"),
    });
    expect(call.store.updateTenantIntegrationSecrets).not.toHaveBeenCalled();
    expect(call.store.createTenantIntegrationSecrets).not.toHaveBeenCalled();
  });

  it("refuses to name the token in the error", async () => {
    setWebhook.mockRejectedValue(new TelegramBotApiError("setWebhook", 401, "Unauthorized", 1));
    const rows = [telegramRow({ username: "cherkashinao_bot", token: "123:super-secret-token" })];
    const call = setup(rows);

    await expect(postWebhook(call.req, call.res)).rejects.toMatchObject({
      message: expect.not.stringContaining("super-secret-token"),
    });
  });

  it("answers 400 when there is no usable bot yet, before calling Telegram", async () => {
    const call = setup([]);

    await expect(postWebhook(call.req, call.res)).rejects.toMatchObject({ type: "invalid_data" });
    expect(setWebhook).not.toHaveBeenCalled();
  });

  it("answers 400 naming BACKEND_PUBLIC_URL when it is unset, before calling Telegram", async () => {
    delete process.env.BACKEND_PUBLIC_URL;
    const rows = [telegramRow({ username: "cherkashinao_bot", token: "123:abc" })];
    const call = setup(rows);

    await expect(postWebhook(call.req, call.res)).rejects.toMatchObject({
      type: "invalid_data",
      message: expect.stringContaining("BACKEND_PUBLIC_URL"),
    });
    expect(setWebhook).not.toHaveBeenCalled();
    expect(call.store.updateTenantIntegrationSecrets).not.toHaveBeenCalled();
  });
});

describe("DELETE /tenants/telegram-bot/webhook", () => {
  it("calls deleteWebhook and drops the secret, keeping the manager chat", async () => {
    const rows = [
      telegramRow({
        username: "cherkashinao_bot",
        token: "123:abc",
        webhook_secret: "live-secret",
        manager_chat_id: 777,
      }),
    ];
    const call = setup(rows);

    await deleteWebhookRoute(call.req, call.res);

    expect(deleteWebhook).toHaveBeenCalledTimes(1);
    expect(call.store.updateTenantIntegrationSecrets).toHaveBeenCalledTimes(1);
    const decrypted = decryptJson<Record<string, unknown>>(rows[0].payload, KEY);
    expect(decrypted.webhook_secret).toBeUndefined();
    expect(decrypted.manager_chat_id).toBe(777);
    expect(call.body()).toMatchObject({ bot: { webhook_connected: false } });
  });

  it("is a no-op against Telegram when there was no webhook secret", async () => {
    const rows = [telegramRow({ username: "cherkashinao_bot", token: "123:abc" })];
    const call = setup(rows);

    await deleteWebhookRoute(call.req, call.res);

    expect(deleteWebhook).not.toHaveBeenCalled();
    expect(call.store.updateTenantIntegrationSecrets).not.toHaveBeenCalled();
  });
});
