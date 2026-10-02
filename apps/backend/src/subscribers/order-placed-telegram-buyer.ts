import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { notifyBuyerTelegram, type BuyerOrderForTelegram } from "../tenant-notifications/buyer-telegram";

const TAG = "order-placed-telegram-buyer";

/**
 * The BUYER hears about their own new order, in Telegram
 * (t-cherk-33-buyer-telegram-notifications). Sits next to
 * `order-placed-email.ts` (the buyer's letter) and `order-placed-telegram.ts`
 * (the shop OWNER's chat) on the same `order.placed` event: three audiences,
 * one event, three subscribers that never fail the order flow between them.
 */
export default async function orderPlacedTelegramBuyerHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const orderId = event.data?.id;
  if (!orderId) {
    logger.warn(`[${TAG}] Missing order id in event payload`);
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "currency_code", "total", "locale", "customer.metadata"],
    filters: { id: orderId },
  });

  const order = orders[0] as BuyerOrderForTelegram | undefined;
  if (!order) {
    logger.warn(`[${TAG}] Order not found: ${orderId}`);
    return;
  }

  await notifyBuyerTelegram({ container, tag: TAG, kind: "order-placed", order });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
