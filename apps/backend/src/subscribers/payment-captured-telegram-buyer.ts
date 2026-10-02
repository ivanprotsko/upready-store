import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { notifyBuyerTelegram, type BuyerOrderForTelegram } from "../tenant-notifications/buyer-telegram";

const TAG = "payment-captured-telegram-buyer";

/**
 * `payment.captured` names a PAYMENT, so the order is reached through its
 * payment collection, the same road `payment-captured-email.ts` and
 * `grant-course-on-paid.ts` take (t-cherk-33-buyer-telegram-notifications).
 */
export default async function paymentCapturedTelegramBuyerHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const paymentId = event.data?.id;
  if (!paymentId) {
    logger.warn(`[${TAG}] Missing payment id in event payload`);
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: [
      "id",
      "payment_collection.order.id",
      "payment_collection.order.display_id",
      "payment_collection.order.currency_code",
      "payment_collection.order.total",
      "payment_collection.order.locale",
      "payment_collection.order.customer.metadata",
    ],
    filters: { id: paymentId },
  });

  const order = (payments[0] as { payment_collection?: { order?: BuyerOrderForTelegram } } | undefined)
    ?.payment_collection?.order;

  if (!order) {
    logger.warn(`[${TAG}] No order linked to payment: ${paymentId}`);
    return;
  }

  await notifyBuyerTelegram({ container, tag: TAG, kind: "payment-captured", order });
}

export const config: SubscriberConfig = {
  event: "payment.captured",
};
