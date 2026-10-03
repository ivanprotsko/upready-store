// t-cherk-33: the shared plumbing of the three buyer-telegram subscribers,
// tested directly against a mocked Bot API — no database, no network.
jest.mock("../shop", () => ({ resolveShopForOrder: jest.fn() }));
jest.mock("../../tenant-secrets/telegram", () => ({ readUsableTelegramBot: jest.fn() }));
jest.mock("../telegram", () => {
  const actual = jest.requireActual("../telegram");
  return { ...actual, sendTelegramMessage: jest.fn() };
});

import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { resolveShopForOrder } from "../shop";
import { readUsableTelegramBot } from "../../tenant-secrets/telegram";
import { sendTelegramMessage, TelegramSendError } from "../telegram";
import { notifyBuyerTelegram, type BuyerOrderForTelegram } from "../buyer-telegram";

const resolveShopForOrderMock = resolveShopForOrder as jest.Mock;
const readUsableTelegramBotMock = readUsableTelegramBot as jest.Mock;
const sendTelegramMessageMock = sendTelegramMessage as jest.Mock;

const SHOP = { tenantId: "ten_1", storefrontUrl: "https://acme.example.com" };
const BOT = { credentials: { token: "123:abc", username: "acme_bot" } };

const buildOrder = (overrides: Partial<BuyerOrderForTelegram> = {}): BuyerOrderForTelegram => ({
  id: "order_1",
  display_id: 42,
  currency_code: "usd",
  total: 1999,
  locale: "en",
  customer: { metadata: { telegram_id: 777 } },
  ...overrides,
});

const buildContainer = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger;
      if (key === ContainerRegistrationKeys.PG_CONNECTION) return {};
      throw new Error(`unexpected resolve(${key})`);
    },
  };
  return { container, logger };
};

describe("notifyBuyerTelegram", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveShopForOrderMock.mockResolvedValue(SHOP);
    readUsableTelegramBotMock.mockResolvedValue(BOT);
  });

  it("sends the buyer a Telegram message on order.placed", async () => {
    sendTelegramMessageMock.mockResolvedValue({ message_id: 55 });
    const { container } = buildContainer();

    const sent = await notifyBuyerTelegram({
      container: container as any,
      tag: "order-placed-telegram-buyer",
      kind: "order-placed",
      order: buildOrder(),
    });

    expect(sent).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("123:abc", "777", expect.stringContaining("42"));
  });

  it("does not call the Bot API when the buyer has no Telegram identity", async () => {
    const { container } = buildContainer();

    const sent = await notifyBuyerTelegram({
      container: container as any,
      tag: "order-placed-telegram-buyer",
      kind: "order-placed",
      order: buildOrder({ customer: { metadata: {} } }),
    });

    expect(sent).toBe(false);
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("does not call the Bot API when the shop has no bot", async () => {
    readUsableTelegramBotMock.mockResolvedValue(null);
    const { container } = buildContainer();

    const sent = await notifyBuyerTelegram({
      container: container as any,
      tag: "payment-captured-telegram-buyer",
      kind: "payment-captured",
      order: buildOrder(),
    });

    expect(sent).toBe(false);
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("retries once on a 429 that names a short wait, then succeeds", async () => {
    jest.useFakeTimers();
    sendTelegramMessageMock
      .mockRejectedValueOnce(new TelegramSendError(429, "Too Many Requests", 1))
      .mockResolvedValueOnce({ message_id: 56 });
    const { container } = buildContainer();

    const resultPromise = notifyBuyerTelegram({
      container: container as any,
      tag: "order-shipment-created-telegram-buyer",
      kind: "shipment-created",
      order: buildOrder(),
    });

    await jest.runAllTimersAsync();
    const sent = await resultPromise;

    expect(sent).toBe(true);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("does not throw when the bot token fails to decrypt, so order.placed still completes", async () => {
    readUsableTelegramBotMock.mockRejectedValue(
      new Error("Unsupported state or unable to authenticate data"),
    );
    const { container, logger } = buildContainer();

    const sent = await notifyBuyerTelegram({
      container: container as any,
      tag: "order-placed-telegram-buyer",
      kind: "order-placed",
      order: buildOrder(),
    });

    expect(sent).toBe(false);
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Unsupported state or unable to authenticate data"),
    );
    expect(logger.error.mock.calls[0][0]).not.toContain(BOT.credentials.token);
  });

  it("gives up without throwing when the retry also fails", async () => {
    sendTelegramMessageMock
      .mockRejectedValueOnce(new TelegramSendError(429, "Too Many Requests", 0))
      .mockRejectedValueOnce(new TelegramSendError(429, "Too Many Requests", 0));
    const { container } = buildContainer();

    const sent = await notifyBuyerTelegram({
      container: container as any,
      tag: "order-placed-telegram-buyer",
      kind: "order-placed",
      order: buildOrder(),
    });

    expect(sent).toBe(false);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
  });
});
