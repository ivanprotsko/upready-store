import { createHmac } from "node:crypto";

import { resolveBotCart, type CartAdoptionPorts } from "../cart-adoption";
import type { OpenCartRow } from "../open-cart";

/**
 * t-cherk-23: the storefront opens the bot's cart inside the Mini App. These
 * are the rules that keep it one buyer's cart in one shop: the proof is real
 * `initData` (signed here the way Telegram signs it, checked by the real
 * `verifyInitData`), and the cart is looked up from the proof alone.
 */

const BOT_TOKEN = "123456:AAAA-fake-token-of-this-shop";
const OTHER_SHOP_BOT_TOKEN = "654321:BBBB-fake-token-of-another-shop";

const NOW_SEC = 1_790_000_000;
const now = () => NOW_SEC * 1000;

/** Signs an initData query string the way Telegram's Mini App platform does. */
const signInitData = (fields: Record<string, string>, botToken = BOT_TOKEN): string => {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken, "utf8").digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};

const initDataFor = (telegramUserId: number, authDate = NOW_SEC, botToken = BOT_TOKEN) =>
  signInitData(
    { auth_date: String(authDate), user: JSON.stringify({ id: telegramUserId, first_name: "Buyer" }) },
    botToken,
  );

const BUYER = { telegramId: 555, customerId: "cus_buyer" };
const OTHER_BUYER = { telegramId: 777, customerId: "cus_other" };
const SHOP_CHANNEL = "sc_this_shop";
const OTHER_SHOP_CHANNEL = "sc_other_shop";

const cart = (id: string, over: Partial<OpenCartRow> = {}): OpenCartRow => ({
  id,
  customer_id: BUYER.customerId,
  sales_channel_id: SHOP_CHANNEL,
  completed_at: null,
  ...over,
});

const buildPorts = (carts: OpenCartRow[]) => {
  const customerIdForTelegramUser = jest.fn(async (telegramUserId: number) => {
    if (telegramUserId === BUYER.telegramId) return BUYER.customerId;
    if (telegramUserId === OTHER_BUYER.telegramId) return OTHER_BUYER.customerId;
    return null;
  });
  const listNewestCarts = jest.fn(async () => carts);
  const ports: CartAdoptionPorts = { customerIdForTelegramUser, listNewestCarts };
  return { ports, customerIdForTelegramUser, listNewestCarts };
};

const input = (over: Partial<Parameters<typeof resolveBotCart>[0]> = {}) => ({
  initData: initDataFor(BUYER.telegramId),
  botToken: BOT_TOKEN,
  salesChannelId: SHOP_CHANNEL,
  sessionCustomerId: BUYER.customerId,
  verifyOptions: { now },
  ...over,
});

describe("resolveBotCart", () => {
  it("adopts the signed-in Telegram buyer's newest open cart in this shop", async () => {
    const { ports, listNewestCarts } = buildPorts([cart("cart_new"), cart("cart_old")]);

    await expect(resolveBotCart(input(), ports)).resolves.toEqual({ ok: true, cartId: "cart_new" });
    expect(listNewestCarts).toHaveBeenCalledWith({
      customerId: BUYER.customerId,
      salesChannelId: SHOP_CHANNEL,
    });
  });

  it("adopts it before the silent sign-in too, on the proof alone", async () => {
    const { ports } = buildPorts([cart("cart_new")]);

    await expect(resolveBotCart(input({ sessionCustomerId: null }), ports)).resolves.toEqual({
      ok: true,
      cartId: "cart_new",
    });
  });

  it("skips a completed cart, the way the bot's own /cart does", async () => {
    const { ports } = buildPorts([
      cart("cart_ordered", { completed_at: "2026-10-05T10:00:00Z" }),
      cart("cart_open"),
    ]);

    await expect(resolveBotCart(input(), ports)).resolves.toEqual({ ok: true, cartId: "cart_open" });
  });

  it("answers no cart for a Telegram user the bot has never seen, without a cart query", async () => {
    const { ports, listNewestCarts } = buildPorts([cart("cart_new")]);

    await expect(
      resolveBotCart(input({ initData: initDataFor(999), sessionCustomerId: null }), ports),
    ).resolves.toEqual({ ok: true, cartId: null });
    expect(listNewestCarts).not.toHaveBeenCalled();
  });

  describe("a cart of another buyer", () => {
    it("is refused when the session belongs to another customer", async () => {
      const { ports, listNewestCarts } = buildPorts([cart("cart_new")]);

      await expect(
        resolveBotCart(input({ sessionCustomerId: OTHER_BUYER.customerId }), ports),
      ).resolves.toEqual({ ok: false, reason: "other_customer" });
      expect(listNewestCarts).not.toHaveBeenCalled();
    });

    it("is never looked up: the customer comes from the proof, not from the caller", async () => {
      const { ports, listNewestCarts } = buildPorts([]);

      await resolveBotCart(
        input({ initData: initDataFor(OTHER_BUYER.telegramId), sessionCustomerId: null }),
        ports,
      );

      expect(listNewestCarts).toHaveBeenCalledWith({
        customerId: OTHER_BUYER.customerId,
        salesChannelId: SHOP_CHANNEL,
      });
    });

    it("is refused even when the query hands it over", async () => {
      const { ports } = buildPorts([cart("cart_of_other_buyer", { customer_id: OTHER_BUYER.customerId })]);

      await expect(resolveBotCart(input(), ports)).resolves.toEqual({ ok: true, cartId: null });
    });
  });

  describe("a cart of another shop", () => {
    it("is refused even when the query hands it over", async () => {
      const { ports } = buildPorts([
        cart("cart_in_other_shop", { sales_channel_id: OTHER_SHOP_CHANNEL }),
        cart("cart_in_this_shop"),
      ]);

      await expect(resolveBotCart(input(), ports)).resolves.toEqual({
        ok: true,
        cartId: "cart_in_this_shop",
      });
    });

    it("is refused when it is the buyer's only cart", async () => {
      const { ports } = buildPorts([cart("cart_in_other_shop", { sales_channel_id: OTHER_SHOP_CHANNEL })]);

      await expect(resolveBotCart(input(), ports)).resolves.toEqual({ ok: true, cartId: null });
    });

    it("is refused when the proof was signed by another shop's bot", async () => {
      const { ports, customerIdForTelegramUser } = buildPorts([cart("cart_new")]);

      await expect(
        resolveBotCart(
          input({ initData: initDataFor(BUYER.telegramId, NOW_SEC, OTHER_SHOP_BOT_TOKEN) }),
          ports,
        ),
      ).resolves.toEqual({ ok: false, reason: "bad_proof" });
      expect(customerIdForTelegramUser).not.toHaveBeenCalled();
    });
  });

  describe("an expired or forged proof", () => {
    it("refuses a proof older than the freshness bound", async () => {
      const { ports, customerIdForTelegramUser, listNewestCarts } = buildPorts([cart("cart_new")]);
      const dayAndABitAgo = NOW_SEC - 86_400 - 60;

      await expect(
        resolveBotCart(input({ initData: initDataFor(BUYER.telegramId, dayAndABitAgo) }), ports),
      ).resolves.toEqual({ ok: false, reason: "expired_proof" });
      expect(customerIdForTelegramUser).not.toHaveBeenCalled();
      expect(listNewestCarts).not.toHaveBeenCalled();
    });

    it("refuses a proof whose user was swapped after signing", async () => {
      const { ports, customerIdForTelegramUser } = buildPorts([cart("cart_new")]);
      const forged = new URLSearchParams(initDataFor(OTHER_BUYER.telegramId));
      forged.set("user", JSON.stringify({ id: BUYER.telegramId, first_name: "Buyer" }));

      await expect(resolveBotCart(input({ initData: forged.toString() }), ports)).resolves.toEqual({
        ok: false,
        reason: "bad_proof",
      });
      expect(customerIdForTelegramUser).not.toHaveBeenCalled();
    });

    it("refuses a proof with no signature", async () => {
      const { ports } = buildPorts([cart("cart_new")]);
      const unsigned = new URLSearchParams({
        auth_date: String(NOW_SEC),
        user: JSON.stringify({ id: BUYER.telegramId }),
      }).toString();

      await expect(resolveBotCart(input({ initData: unsigned }), ports)).resolves.toEqual({
        ok: false,
        reason: "bad_proof",
      });
    });

    it("refuses a call with no proof at all", async () => {
      const { ports, listNewestCarts } = buildPorts([cart("cart_new")]);

      await expect(resolveBotCart(input({ initData: null }), ports)).resolves.toEqual({
        ok: false,
        reason: "bad_proof",
      });
      expect(listNewestCarts).not.toHaveBeenCalled();
    });
  });
});
