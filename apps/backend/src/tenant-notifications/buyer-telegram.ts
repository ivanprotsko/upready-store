import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { getLocaleFromMetadata } from "../emails/i18n";
import { readUsableTelegramBot } from "../tenant-secrets/telegram";
import { resolveBuyerLocale } from "./buyer-messages";
import { formatBuyerOrderMessage, type BuyerOrderKind, type BuyerOrderMessageOrder } from "./buyer-order-message";
import { resolveShopForOrder } from "./shop";
import { sendTelegramMessage, TelegramSendError, type SentMessage } from "./telegram";

/**
 * Shared plumbing for the three buyer-telegram subscribers
 * (t-cherk-33-buyer-telegram-notifications), the way `emails/lib/notify.ts`'s
 * `sendOrderEmail` is shared by the e-mail subscribers.
 *
 * This is the SHOP's own bot, read per order from `tenant_integration_secret`
 * (t-2026-10-02-telegram-auth), never the platform bot
 * `order-placed-telegram.ts` uses for the owner's chat: the buyer's `chat_id`
 * is their Telegram user id, and only the bot the buyer actually opened
 * (their shop's) has a chat with them to send into.
 *
 * Nothing here throws. The order has already been placed or paid or shipped
 * by the time any of these three events fire, and an unreachable buyer in
 * Telegram is a delivery problem, not a reason to fail the order flow a
 * second notifier (the buyer's e-mail) already serves.
 */

/** Telegram answers a 429 naming its own wait; this is the ceiling one subscriber run may sleep. */
const MAX_RETRY_WAIT_SEC = 30;
/** Used when a 429 names no wait of its own. */
const DEFAULT_RETRY_WAIT_SEC = 1;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One `sendMessage`, retried once on a 429 that names a wait short enough to
 * sleep through. A second failure (another 429 included) is thrown to the
 * caller, which logs it and gives up rather than looping — a buyer's order
 * notice is worth one retry, not a backoff chain that holds the event bus.
 */
const sendWithRetry = async (token: string, chatId: string, text: string): Promise<SentMessage> => {
  try {
    return await sendTelegramMessage(token, chatId, text);
  } catch (error) {
    if (!(error instanceof TelegramSendError) || error.code !== 429) {
      throw error;
    }

    const waitSec = error.retryAfterSec ?? DEFAULT_RETRY_WAIT_SEC;
    if (waitSec > MAX_RETRY_WAIT_SEC) {
      throw error;
    }

    await sleep(waitSec * 1000);
    return sendTelegramMessage(token, chatId, text);
  }
};

export type BuyerOrderForTelegram = BuyerOrderMessageOrder & {
  locale?: string | null;
  customer?: { metadata?: Record<string, unknown> | null } | null;
};

export type NotifyBuyerTelegramOptions = {
  container: MedusaContainer;
  /** Prefixes every log line, for example `order-placed-telegram-buyer`. */
  tag: string;
  kind: BuyerOrderKind;
  order: BuyerOrderForTelegram;
};

/** `true` when a Telegram message went out; `false` on every skip or failure, never a throw. */
export async function notifyBuyerTelegram({
  container,
  tag,
  kind,
  order,
}: NotifyBuyerTelegramOptions): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const telegramId = order.customer?.metadata?.telegram_id;
  if (typeof telegramId !== "number" && typeof telegramId !== "string") {
    logger.info(`[${tag}] Order ${order.id}: buyer has no Telegram identity, skipping`);
    return false;
  }

  const shop = await resolveShopForOrder(container, order.id);
  if (!shop.tenantId) {
    logger.info(`[${tag}] Order ${order.id}: no shop resolved, skipping buyer Telegram notice`);
    return false;
  }

  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const bot = await readUsableTelegramBot(pg, shop.tenantId);
  if (!bot) {
    logger.info(
      `[${tag}] Order ${order.id}: shop ${shop.tenantId} has no Telegram bot, skipping buyer notice`,
    );
    return false;
  }

  const locale = resolveBuyerLocale(order.locale, getLocaleFromMetadata(order.customer?.metadata));
  const text = formatBuyerOrderMessage({
    kind,
    order,
    locale,
    orderUrl: `${shop.storefrontUrl}/account/orders/details/${order.id}`,
  });

  try {
    const sent = await sendWithRetry(bot.credentials.token, String(telegramId), text);
    logger.info(
      `[${tag}] Order ${order.id}: buyer notified in Telegram (shop ${shop.tenantId}), message ${sent.message_id}`,
    );
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`[${tag}] Order ${order.id}: buyer Telegram notice failed: ${reason}`);
    return false;
  }
}
