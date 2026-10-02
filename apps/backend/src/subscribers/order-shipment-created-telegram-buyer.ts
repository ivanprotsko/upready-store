import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { suppressedByAdmin } from "../emails/lib/notify";
import { notifyBuyerTelegram, type BuyerOrderForTelegram } from "../tenant-notifications/buyer-telegram";

const TAG = "order-shipment-created-telegram-buyer";

/**
 * `shipment.created` carries only the fulfillment id, so the order is
 * resolved through `fulfillments.id`, the same road
 * `order-shipment-created-email.ts` takes
 * (t-cherk-33-buyer-telegram-notifications). The Admin's "do not notify the
 * customer" checkbox is honoured here too: it means every buyer channel, not
 * only e-mail.
 */
export default async function orderShipmentCreatedTelegramBuyerHandler({
  event,
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const fulfillmentId = event.data?.id;
  if (!fulfillmentId) {
    logger.warn(`[${TAG}] Missing fulfillment id in event payload`);
    return;
  }

  if (suppressedByAdmin(container, TAG, event.data, fulfillmentId)) {
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "currency_code", "total", "locale", "customer.metadata"],
    filters: { fulfillments: { id: fulfillmentId } },
  });

  const order = orders[0] as BuyerOrderForTelegram | undefined;
  if (!order) {
    logger.warn(`[${TAG}] No order linked to fulfillment: ${fulfillmentId}`);
    return;
  }

  await notifyBuyerTelegram({ container, tag: TAG, kind: "shipment-created", order });
}

export const config: SubscriberConfig = {
  event: "shipment.created",
};
