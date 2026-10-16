import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * `GET /store/telegram-mini-app` (t-2026-10-16-38). On a multi-tenant engine
 * the route answered from `store.metadata`, one document for every shop, and
 * said `null` for cherkashino.com while its bot was connected. The tenant
 * lookup, the bot secret and the store record are stubbed; the link builders
 * are the real ones.
 */
jest.mock("../../tenant/resolve-tenant", () => ({
  resolveTenantFromPublishableKey: jest.fn(),
}));
jest.mock("../../../../tenant-secrets/telegram", () => ({
  readTelegramBotSecret: jest.fn(),
}));
jest.mock("../../../../telegram/store-record", () => ({
  readStoreRecord: jest.fn(),
}));

import { GET } from "../route";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";
import { readTelegramBotSecret } from "../../../../tenant-secrets/telegram";
import { readStoreRecord } from "../../../../telegram/store-record";

const mockResolveTenant = resolveTenantFromPublishableKey as jest.Mock;
const mockReadSecret = readTelegramBotSecret as jest.Mock;
const mockReadStoreRecord = readStoreRecord as jest.Mock;

const TENANT = { id: "ten_com", handle: "cherkashino-com", name: "Черкашино", sales_channel_id: "sc_com" };
const BOT_TOKEN = "123456:AAAA-fake-token-of-this-shop";

const secretWith = (credentials: Record<string, unknown>) => ({
  id: "tis_1",
  tenant_id: TENANT.id,
  is_enabled: true,
  credentials: { username: "cherkashino_login_bot", token: BOT_TOKEN, ...credentials },
});

const setup = (tenantRow: Record<string, unknown> = {}) => {
  const graph = jest.fn(async (_args: unknown) => ({ data: [tenantRow] }));
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.PG_CONNECTION]: {},
    [ContainerRegistrationKeys.QUERY]: { graph },
  };
  const req = {
    scope: {
      resolve: (key: string) => {
        if (!(key in services)) {
          throw new Error(`test scope has no ${key}`);
        }
        return services[key];
      },
    },
  };
  const json = jest.fn();
  const res = { status: jest.fn(() => res), json };
  return { req: req as never, res: res as never, json, graph };
};

describe("GET /store/telegram-mini-app", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockResolveTenant.mockResolvedValue(TENANT);
  });

  it("answers from the shop's own bot, with the menu button the connect call set", async () => {
    mockReadSecret.mockResolvedValue(secretWith({ webhook_secret: "whs_1" }));
    const { req, res, json, graph } = setup({
      handle: TENANT.handle,
      locale_settings: { default_locale: "en" },
      domains: [{ host: "cherkashino.com", is_primary: true }],
    });

    await GET(req, res);

    expect(mockReadSecret).toHaveBeenCalledWith({}, TENANT.id);
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "tenant", filters: { handle: TENANT.handle } }));
    expect(json).toHaveBeenCalledWith({
      mini_app: {
        bot_username: "cherkashino_login_bot",
        chat_url: "https://t.me/cherkashino_login_bot",
        main_mini_app_url: "https://t.me/cherkashino_login_bot?startapp",
        menu_button_url: "https://cherkashino.com/en",
        provisioned_at: null,
      },
    });
    expect(mockReadStoreRecord).not.toHaveBeenCalled();
  });

  it("reports no menu button while the bot is saved but not connected", async () => {
    mockReadSecret.mockResolvedValue(secretWith({}));
    const { req, res, json, graph } = setup();

    await GET(req, res);

    expect(graph).not.toHaveBeenCalled();
    expect(json.mock.calls[0][0].mini_app).toMatchObject({
      bot_username: "cherkashino_login_bot",
      menu_button_url: null,
    });
  });

  it("answers null for a shop with no bot, never another shop's store-wide record", async () => {
    mockReadSecret.mockResolvedValue(null);
    mockReadStoreRecord.mockResolvedValue({ record: { botUsername: "someone_elses_bot" } });
    const { req, res, json } = setup();

    await GET(req, res);

    expect(json).toHaveBeenCalledWith({ mini_app: null });
    expect(mockReadStoreRecord).not.toHaveBeenCalled();
  });

  it("never carries the token", async () => {
    mockReadSecret.mockResolvedValue(secretWith({ webhook_secret: "whs_1" }));
    const { req, res, json } = setup({ handle: TENANT.handle });

    await GET(req, res);

    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("whs_1");
  });

  it("keeps the store-wide record for a key with no shop behind it", async () => {
    mockResolveTenant.mockRejectedValue(
      new MedusaError(MedusaError.Types.NOT_FOUND, "No tenant behind this publishable key."),
    );
    mockReadStoreRecord.mockResolvedValue({
      record: {
        botUsername: "single_store_bot",
        launch: {
          chatUrl: "https://t.me/single_store_bot",
          mainMiniAppUrl: "https://t.me/single_store_bot?startapp",
          menuButton: { text: "Shop", url: "https://shop.example/mini" },
        },
        provisionedAt: "2026-10-01T00:00:00.000Z",
      },
    });
    const { req, res, json } = setup();

    await GET(req, res);

    expect(mockReadSecret).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({
      mini_app: {
        bot_username: "single_store_bot",
        chat_url: "https://t.me/single_store_bot",
        main_mini_app_url: "https://t.me/single_store_bot?startapp",
        menu_button_url: "https://shop.example/mini",
        provisioned_at: "2026-10-01T00:00:00.000Z",
      },
    });
  });
});
