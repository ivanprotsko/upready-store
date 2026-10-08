// t-cherk-33: the shipment.created subscriber of the buyer's Telegram notice,
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
import orderShipmentCreatedTelegramBuyerHandler from "../order-shipment-created-telegram-buyer";

const resolveShopForOrderMock = resolveShopForOrder as jest.Mock;
const readUsableTelegramBotMock = readUsableTelegramBot as jest.Mock;
const sendTelegramMessageMock = sendTelegramMessage as jest.Mock;
const notifyBuyerTelegramMock = notifyBuyerTelegram as jest.Mock;

const TAG = "order-shipment-created-telegram-buyer";
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

const buildContainer = (orders: unknown[]) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const query = { graph: jest.fn(async () => ({ data: orders })) };
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

// The event type names `id` as required, yet the handler guards against an
// event without one, so the payload is typed loosely here.
const run = (container: unknown, data: { id?: string; no_notification?: boolean }) =>
  orderShipmentCreatedTelegramBuyerHandler({
    event: { name: "shipment.created", data: data as { id: string } },
    container: container as any,
    pluginOptions: {},
  });

describe("order-shipment-created-telegram-buyer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveShopForOrderMock.mockResolvedValue(SHOP);
    readUsableTelegramBotMock.mockResolvedValue(BOT);
    sendTelegramMessageMock.mockResolvedValue({ message_id: 55 });
  });

  it("warns and does not call the Bot API when the event carries no fulfillment id", async () => {
    const { container, logger, query } = buildContainer([]);

    await run(container, {});

    expect(logger.warn).toHaveBeenCalledWith(`[${TAG}] Missing fulfillment id in event payload`);
    expect(query.graph).not.toHaveBeenCalled();
    expect(notifyBuyerTelegramMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("warns and does not call the Bot API when no order is linked to the fulfillment", async () => {
    const { container, logger } = buildContainer([]);

    await run(container, { id: "ful_1" });

    expect(logger.warn).toHaveBeenCalledWith(`[${TAG}] No order linked to fulfillment: ful_1`);
    expect(notifyBuyerTelegramMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("hands notifyBuyerTelegram the shipment-created kind and the fulfillment's order", async () => {
    const { container, logger, query } = buildContainer([ORDER]);

    await run(container, { id: "ful_1" });

    expect(query.graph).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "order", filters: { fulfillments: { id: "ful_1" } } }),
    );
    expect(notifyBuyerTelegramMock).toHaveBeenCalledTimes(1);
    expect(notifyBuyerTelegramMock).toHaveBeenCalledWith({
      container,
      tag: TAG,
      kind: "shipment-created",
      order: ORDER,
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      "123:abc",
      "777",
      expect.stringMatching(/^Заказ №42 отправлен\n/),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
