import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { OrderCompletedEmail } from "../emails/order-completed";
import { findOrderForEmail, sendOrderEmail } from "../emails/lib/notify";

const TAG = "order-completed-email";

export default async function orderCompletedEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const orderId = event.data?.id;
  if (!orderId) {
    logger.warn(`[${TAG}] Missing order id in event payload`);
    return;
  }

  const order = await findOrderForEmail(
    container,
    { id: orderId },
    ["total", "shipping_total", "items.*"],
  );
  if (!order) {
    logger.warn(`[${TAG}] Order not found: ${orderId}`);
    return;
  }

  await sendOrderEmail({
    container,
    tag: TAG,
    eventName: event.name,
    order,
    template: "order-completed",
    idempotencyKey: `order-completed:${order.id}`,
    Component: OrderCompletedEmail,
    subjectKey: "OrderCompleted.subject",
    text: (t, id, shop) =>
      [
        t("OrderCompleted.textFallback", { id }),
        "",
        `${shop.storefrontUrl}/account/orders`,
      ].join("\n"),
  });
}

export const config: SubscriberConfig = {
  event: "order.completed",
};
