// t-cherk-33: the payment.captured subscriber of the buyer's Telegram notice,
// run against a mocked container and a mocked Bot API — no database, no network.
// The shop resolver and the bot read are mocked whole, so `shop.ts` and the
// module links it imports (`defineLink` needs a booted Medusa) never load.
// `notifyBuyerTelegram` stays the real one behind a spy, so the found case
// reaches the Bot API mock and a skipped case proves no message left.
jest.mock("../../tenant-notifications/shop", () => ({ resolveShopForOrder: jest.fn() }));
jest.mock("../../tenant-secrets/telegram", () => ({ readUsableTelegramBot: jest.fn() }));
jest.mock("../../tenant-notifications/telegram", () => {
  const actual = jest.requireActual("../../tenant-notifications/telegram");
  return { ...actual, sendTelegramMessage: jest.fn() };
});
jest.mock("../../tenant-notifications/buyer-telegram", () => {
  const actual = jest.requireActual("../../tenant-notifications/buyer-telegram");
  return { ...actual, notifyBuyerTelegram: jest.fn(actual.notifyBuyerTelegram) };
});

import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { resolveShopForOrder } from "../../tenant-notifications/shop";
import { readUsableTelegramBot } from "../../tenant-secrets/telegram";
import { sendTelegramMessage } from "../../tenant-notifications/telegram";
import { notifyBuyerTelegram, type BuyerOrderForTelegram } from "../../tenant-notifications/buyer-telegram";
import paymentCapturedTelegramBuyerHandler from "../payment-captured-telegram-buyer";

const resolveShopForOrderMock = resolveShopForOrder as jest.Mock;
const readUsableTelegramBotMock = readUsableTelegramBot as jest.Mock;
const sendTelegramMessageMock = sendTelegramMessage as jest.Mock;
const notifyBuyerTelegramMock = notifyBuyerTelegram as jest.Mock;

const TAG = "payment-captured-telegram-buyer";
const SHOP = { tenantId: "ten_1", storefrontUrl: "https://acme.example.com" };
const BOT = { credentials: { token: "123:abc", username: "acme_bot" } };

const ORDER: BuyerOrderForTelegram = {
  id: "order_1",
  display_id: 42,
  currency_code: "rub",
  total: 1999,
  locale: "ru",
  customer: { metadata: { telegram_id: 777 } },
};

const buildContainer = (payments: unknown[]) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const query = { graph: jest.fn(async () => ({ data: payments })) };
  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger;
      if (key === ContainerRegistrationKeys.QUERY) return query;
      if (key === ContainerRegistrationKeys.PG_CONNECTION) return {};
      throw new Error(`unexpected resolve(${key})`);
    },
  };
  return { container, logger, query };
};

const run = (container: unknown, data: { id?: string }) =>
  paymentCapturedTelegramBuyerHandler({
    event: { name: "payment.captured", data },
    container: container as any,
    pluginOptions: {},
  });

describe("payment-captured-telegram-buyer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveShopForOrderMock.mockResolvedValue(SHOP);
    readUsableTelegramBotMock.mockResolvedValue(BOT);
    sendTelegramMessageMock.mockResolvedValue({ message_id: 55 });
  });

  it("warns and does not call the Bot API when the event carries no payment id", async () => {
    const { container, logger, query } = buildContainer([]);

    await run(container, {});

    expect(logger.warn).toHaveBeenCalledWith(`[${TAG}] Missing payment id in event payload`);
    expect(query.graph).not.toHaveBeenCalled();
    expect(notifyBuyerTelegramMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no payment row", []],
    ["a payment linked to no order", [{ id: "pay_1", payment_collection: null }]],
  ])("warns and does not call the Bot API when the order is not found (%s)", async (_label, payments) => {
    const { container, logger } = buildContainer(payments);

    await run(container, { id: "pay_1" });

    expect(logger.warn).toHaveBeenCalledWith(`[${TAG}] No order linked to payment: pay_1`);
    expect(notifyBuyerTelegramMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("hands notifyBuyerTelegram the payment-captured kind and the payment's order", async () => {
    const { container, logger, query } = buildContainer([
      { id: "pay_1", payment_collection: { order: ORDER } },
    ]);

    await run(container, { id: "pay_1" });

    expect(query.graph).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "payment", filters: { id: "pay_1" } }),
    );
    expect(notifyBuyerTelegramMock).toHaveBeenCalledTimes(1);
    expect(notifyBuyerTelegramMock).toHaveBeenCalledWith({
      container,
      tag: TAG,
      kind: "payment-captured",
      order: ORDER,
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      "123:abc",
      "777",
      expect.stringMatching(/^Заказ №42 оплачен\n/),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
