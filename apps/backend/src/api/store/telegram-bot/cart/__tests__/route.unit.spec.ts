import { createHmac } from "node:crypto";

import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";

/**
 * `POST /store/telegram-bot/cart` (t-cherk-23). The tenant lookup and the bot
 * secret are stubbed; the proof check and the cart rules are the real ones, so
 * this holds the route's own wiring: which shop, which customer, which query,
 * and which answer a refusal gets.
 */
jest.mock("../../../tenant/resolve-tenant", () => ({
  resolveTenantFromPublishableKey: jest.fn(),
}));
jest.mock("../../../../../tenant-secrets/telegram", () => ({
  readUsableTelegramBot: jest.fn(),
}));

import { POST } from "../route";
import { resolveTenantFromPublishableKey } from "../../../tenant/resolve-tenant";
import { readUsableTelegramBot } from "../../../../../tenant-secrets/telegram";

const mockResolveTenant = resolveTenantFromPublishableKey as jest.Mock;
const mockReadUsableTelegramBot = readUsableTelegramBot as jest.Mock;

const BOT_TOKEN = "123456:AAAA-fake-token-of-this-shop";
const TENANT = { id: "ten_1", handle: "olavka", name: "Olavka", sales_channel_id: "sc_this_shop" };
const BUYER = { telegramId: 555, customerId: "cus_buyer" };

const nowSec = () => Math.floor(Date.now() / 1000);

const signInitData = (fields: Record<string, string>, botToken = BOT_TOKEN): string => {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken, "utf8").digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};

const initDataFor = (telegramUserId: number, authDate = nowSec()) =>
  signInitData({ auth_date: String(authDate), user: JSON.stringify({ id: telegramUserId }) });

type Row = Record<string, unknown>;

const setup = (opts: {
  body?: unknown;
  carts?: Row[];
  identity?: Row | null;
  sessionCustomerId?: string;
}) => {
  const graph = jest.fn(async (_args: unknown) => ({ data: opts.carts ?? [] }));
  const listAuthIdentities = jest.fn(async (_filter: unknown) =>
    opts.identity === null
      ? []
      : [opts.identity ?? { id: "authid_1", app_metadata: { customer_id: BUYER.customerId } }],
  );
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.PG_CONNECTION]: {},
    [ContainerRegistrationKeys.QUERY]: { graph },
    [Modules.AUTH]: { listAuthIdentities },
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
    body: opts.body,
    auth_context: opts.sessionCustomerId ? { actor_id: opts.sessionCustomerId } : undefined,
  };
  const json = jest.fn();
  return { req: req as never, res: { json } as never, json, graph, listAuthIdentities };
};

describe("POST /store/telegram-bot/cart", () => {
  beforeEach(() => {
    mockResolveTenant.mockReset();
    mockResolveTenant.mockResolvedValue(TENANT);
    mockReadUsableTelegramBot.mockReset();
    mockReadUsableTelegramBot.mockResolvedValue({
      credentials: { username: "olavka_bot", token: BOT_TOKEN },
    });
  });

  it("answers the buyer's open cart, asked for by the proven customer and this shop's channel", async () => {
    const { req, res, json, graph, listAuthIdentities } = setup({
      body: { initData: initDataFor(BUYER.telegramId) },
      sessionCustomerId: BUYER.customerId,
      carts: [
        { id: "cart_bot", customer_id: BUYER.customerId, sales_channel_id: "sc_this_shop", completed_at: null },
      ],
    });

    await POST(req, res);

    expect(json).toHaveBeenCalledWith({ cart_id: "cart_bot" });
    expect(listAuthIdentities).toHaveBeenCalledWith({
      provider_identities: { entity_id: "telegram:555", provider: "telegram" },
    });
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "cart",
        filters: { customer_id: BUYER.customerId, sales_channel_id: "sc_this_shop" },
        pagination: { take: 10, order: { created_at: "DESC" } },
      }),
    );
    expect(mockReadUsableTelegramBot).toHaveBeenCalledWith(expect.anything(), TENANT.id);
  });

  it("ignores a cart id the caller names: the answer is the looked-up cart only", async () => {
    const { req, res, json } = setup({
      body: { initData: initDataFor(BUYER.telegramId), cart_id: "cart_of_somebody_else" },
      carts: [
        { id: "cart_bot", customer_id: BUYER.customerId, sales_channel_id: "sc_this_shop", completed_at: null },
      ],
    });

    await POST(req, res);

    expect(json).toHaveBeenCalledWith({ cart_id: "cart_bot" });
  });

  it("answers null when the buyer's only cart sits in another shop's channel", async () => {
    const { req, res, json } = setup({
      body: { initData: initDataFor(BUYER.telegramId) },
      carts: [
        { id: "cart_elsewhere", customer_id: BUYER.customerId, sales_channel_id: "sc_other_shop", completed_at: null },
      ],
    });

    await POST(req, res);

    expect(json).toHaveBeenCalledWith({ cart_id: null });
  });

  it("answers null for a Telegram identity with no customer", async () => {
    const { req, res, json, graph } = setup({
      body: { initData: initDataFor(BUYER.telegramId) },
      identity: null,
    });

    await POST(req, res);

    expect(json).toHaveBeenCalledWith({ cart_id: null });
    expect(graph).not.toHaveBeenCalled();
  });

  it("refuses a session of another customer with 403", async () => {
    const { req, res, json, graph } = setup({
      body: { initData: initDataFor(BUYER.telegramId) },
      sessionCustomerId: "cus_other",
    });

    await expect(POST(req, res)).rejects.toMatchObject({ type: MedusaError.Types.FORBIDDEN });
    expect(json).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });

  it("refuses a forged proof with 401", async () => {
    const forged = new URLSearchParams(initDataFor(777));
    forged.set("user", JSON.stringify({ id: BUYER.telegramId }));
    const { req, res, json, listAuthIdentities } = setup({ body: { initData: forged.toString() } });

    await expect(POST(req, res)).rejects.toMatchObject({ type: MedusaError.Types.UNAUTHORIZED });
    expect(json).not.toHaveBeenCalled();
    expect(listAuthIdentities).not.toHaveBeenCalled();
  });

  it("refuses an expired proof with 401", async () => {
    const twoDaysAgo = nowSec() - 2 * 86_400;
    const { req, res, json } = setup({ body: { initData: initDataFor(BUYER.telegramId, twoDaysAgo) } });

    await expect(POST(req, res)).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
      message: expect.stringMatching(/expired/i),
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("refuses a body with no proof with 401", async () => {
    const { req, res, json } = setup({ body: { cart_id: "cart_of_somebody_else" } });

    await expect(POST(req, res)).rejects.toMatchObject({ type: MedusaError.Types.UNAUTHORIZED });
    expect(json).not.toHaveBeenCalled();
  });

  it("refuses a shop with no usable bot", async () => {
    mockReadUsableTelegramBot.mockResolvedValue(null);
    const { req, res, json } = setup({ body: { initData: initDataFor(BUYER.telegramId) } });

    await expect(POST(req, res)).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
    expect(json).not.toHaveBeenCalled();
  });
});
