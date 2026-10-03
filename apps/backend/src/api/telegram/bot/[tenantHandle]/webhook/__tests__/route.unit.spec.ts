import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * The route under test talks to five neighbours; all five are stubbed so this
 * is a pure test of the route's own branching (tenant lookup, bot lookup,
 * secret check, idempotency, "never fail Telegram's retry budget"). Real
 * logic for `webhookSecretMatches` is used as-is — it is cheap, deterministic,
 * and exercising the real function is more honest than mocking it.
 *
 * Each factory builds its own `jest.fn()` rather than closing over an outer
 * `const`: `jest.mock` factories run before the file's own top-level `const`s
 * are initialized, so capturing one by reference throws `ReferenceError:
 * Cannot access '…' before initialization`. The mock is then re-imported
 * below (the SAME function the route imports) and cast to `jest.Mock` where a
 * test needs `.mockResolvedValue`/`.mock.calls`.
 */
jest.mock("../../../../../../shop-bot/router", () => ({ handleUpdate: jest.fn() }));
jest.mock("../../../../../../shop-bot/medusa-shop", () => ({
  createMedusaShop: jest.fn(() => ({ shop: true })),
}));
jest.mock("../../../../../../shop-bot/updates", () => ({ claimUpdate: jest.fn() }));
jest.mock("../../../../../../tenant-secrets/telegram", () => ({
  readUsableTelegramBot: jest.fn(),
}));
jest.mock("../../../../../../telegram/bot-api", () => ({
  createBotApi: jest.fn(() => ({ sendMessage: jest.fn() })),
}));
jest.mock("../../../../../../tenant-notifications/storefront-origin", () => ({
  shopOrigin: () => "https://cherkashinao.example",
}));

import { POST } from "../route";
import { handleUpdate } from "../../../../../../shop-bot/router";
import { createMedusaShop } from "../../../../../../shop-bot/medusa-shop";
import { claimUpdate } from "../../../../../../shop-bot/updates";
import { readUsableTelegramBot } from "../../../../../../tenant-secrets/telegram";
import { TELEGRAM_SECRET_HEADER } from "../../../../../../shop-bot/webhook-secret";

const mockHandleUpdate = handleUpdate as jest.Mock;
const mockCreateMedusaShop = createMedusaShop as jest.Mock;
const mockClaimUpdate = claimUpdate as jest.Mock;
const mockReadUsableTelegramBot = readUsableTelegramBot as jest.Mock;

type TenantRow = Record<string, unknown> | undefined;

const setup = (tenant: TenantRow, headers: Record<string, string | string[]> = {}) => {
  const query = {
    graph: jest.fn(async () => ({ data: [tenant] })),
  };
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    [ContainerRegistrationKeys.PG_CONNECTION]: {},
    [ContainerRegistrationKeys.QUERY]: query,
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
    params: { tenantHandle: "cherkashinao" },
    headers,
    body: { update_id: 100, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "/start" } },
  };
  let statusCode = 200;
  let body: unknown;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (value: unknown) => {
      body = value;
      return res;
    },
  };
  return {
    req: req as never,
    res: res as never,
    scope,
    status: () => statusCode,
    body: () => body,
    logger: services[ContainerRegistrationKeys.LOGGER] as { error: jest.Mock },
  };
};

const tenantRow = (over: Record<string, unknown> = {}) => ({
  id: "ten_cherk23",
  handle: "cherkashinao",
  name: "Cherkashina",
  sales_channel: { id: "sc_cherk23" },
  locale_settings: { default_locale: "ru", default_country: "ru" },
  domains: [],
  ...over,
});

const usableBot = (over: Record<string, unknown> = {}) => ({
  credentials: {
    username: "cherkashinao_bot",
    token: "123:abc",
    webhook_secret: "the-right-secret",
    ...over,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHandleUpdate.mockResolvedValue(undefined);
});

describe("POST /telegram/bot/:tenantHandle/webhook", () => {
  it("404s on an unknown tenant handle, before touching Telegram or the bot row", async () => {
    const call = setup(undefined);

    await POST(call.req, call.res);

    expect(call.status()).toBe(404);
    expect(mockReadUsableTelegramBot).not.toHaveBeenCalled();
  });

  it("404s when the shop has no usable bot (no row, or no webhook_secret)", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(null);
    const call = setup(tenantRow());

    await POST(call.req, call.res);

    expect(call.status()).toBe(404);
    expect(mockHandleUpdate).not.toHaveBeenCalled();
  });

  it("404s when the bot has credentials but no webhook_secret set", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot({ webhook_secret: undefined }));
    const call = setup(tenantRow());

    await POST(call.req, call.res);

    expect(call.status()).toBe(404);
  });

  it("401s on a wrong secret header, with no detail in the body", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot());
    const call = setup(tenantRow(), { [TELEGRAM_SECRET_HEADER]: "wrong" });

    await POST(call.req, call.res);

    expect(call.status()).toBe(401);
    expect(call.body()).toEqual({});
    expect(mockClaimUpdate).not.toHaveBeenCalled();
    expect(mockHandleUpdate).not.toHaveBeenCalled();
  });

  it("401s when the secret header is missing entirely", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot());
    const call = setup(tenantRow());

    await POST(call.req, call.res);

    expect(call.status()).toBe(401);
  });

  it("a duplicate update_id answers 200 without calling handleUpdate", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot());
    mockClaimUpdate.mockResolvedValue(false);
    const call = setup(tenantRow(), { [TELEGRAM_SECRET_HEADER]: "the-right-secret" });

    await POST(call.req, call.res);

    expect(call.status()).toBe(200);
    expect(call.body()).toEqual({ ok: true });
    expect(mockHandleUpdate).not.toHaveBeenCalled();
  });

  it("a new update_id calls handleUpdate with a built context, then answers 200", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot());
    mockClaimUpdate.mockResolvedValue(true);
    const call = setup(tenantRow(), { [TELEGRAM_SECRET_HEADER]: "the-right-secret" });

    await POST(call.req, call.res);

    expect(call.status()).toBe(200);
    expect(call.body()).toEqual({ ok: true });
    expect(mockHandleUpdate).toHaveBeenCalledTimes(1);
    const [update, ctx] = mockHandleUpdate.mock.calls[0];
    expect(update.update_id).toBe(100);
    expect(ctx.shopName).toBe("Cherkashina");
    expect(ctx.botUsername).toBe("cherkashinao_bot");
    expect(ctx.locale).toBe("ru");
    expect(ctx.storefrontUrl).toBe("https://cherkashinao.example/ru");
    expect(ctx.managerChatId).toBeNull();
    expect(typeof ctx.managerLinkCode).toBe("string");
    expect(mockCreateMedusaShop).toHaveBeenCalledWith(
      call.scope,
      expect.objectContaining({ id: "ten_cherk23", salesChannelId: "sc_cherk23", defaultCountry: "ru" }),
    );
  });

  it("an error thrown by handleUpdate is logged (never the token) and still answers 200", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot({ token: "123:super-secret-token" }));
    mockClaimUpdate.mockResolvedValue(true);
    mockHandleUpdate.mockRejectedValue(new Error("router exploded"));
    const call = setup(tenantRow(), { [TELEGRAM_SECRET_HEADER]: "the-right-secret" });

    await POST(call.req, call.res);

    expect(call.status()).toBe(200);
    expect(call.body()).toEqual({ ok: true });
    expect(call.logger.error).toHaveBeenCalledTimes(1);
    const logged = call.logger.error.mock.calls[0][0] as string;
    expect(logged).toContain("router exploded");
    expect(logged).not.toContain("123:super-secret-token");
  });

  it("accepts the secret header arriving as an array (as some proxies deliver it)", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(usableBot());
    mockClaimUpdate.mockResolvedValue(true);
    const call = setup(tenantRow(), { [TELEGRAM_SECRET_HEADER]: ["the-right-secret"] });

    await POST(call.req, call.res);

    expect(call.status()).toBe(200);
    expect(mockHandleUpdate).toHaveBeenCalledTimes(1);
  });
});
