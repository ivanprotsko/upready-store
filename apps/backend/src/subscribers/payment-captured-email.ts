import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { PaymentCapturedEmail } from "../emails/payment-captured";
import { type OrderForEmail, sendOrderEmail } from "../emails/lib/notify";

const TAG = "order-paid-email";

/**
 * `payment.captured` names a PAYMENT, so the order is reached through its
 * payment collection rather than by `findOrderForEmail`. Everything after that
 * is the shared path (t08-order-notifications): the shop is resolved from the
 * order, and the letter links to that shop.
 */
export default async function orderPaidEmailHandler({
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
      "payment_collection.order.*",
      "payment_collection.order.items.*",
      "payment_collection.order.shipping_address.*",
      "payment_collection.order.customer.*",
    ],
    filters: { id: paymentId },
  });

  if (!payments.length) {
    logger.warn(`[${TAG}] Payment not found: ${paymentId}`);
    return;
  }

  const order = (payments[0] as { payment_collection?: { order?: OrderForEmail } })
    .payment_collection?.order;

  if (!order) {
    logger.warn(`[${TAG}] No order linked to payment: ${paymentId}`);
    return;
  }

  await sendOrderEmail({
    container,
    tag: TAG,
    eventName: event.name,
    order,
    template: "order-paid",
    idempotencyKey: `order-paid:${order.id}`,
    Component: PaymentCapturedEmail,
    subjectKey: "Payment.subject",
    text: (t, id, shop) =>
      [t("Payment.textFallback", { id }), "", `${shop.storefrontUrl}/account/orders`].join("\n"),
  });
}

export const config: SubscriberConfig = {
  event: "payment.captured",
};
