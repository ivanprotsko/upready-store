import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { OrderPlacedEmail } from "../emails/order-placed";
import { findOrderForEmail, sendOrderEmail } from "../emails/lib/notify";

const TAG = "order-placed-email";

/**
 * The customer's confirmation. Since t08-order-notifications it goes through
 * the shared helper like every other order letter, so the links inside it point
 * at the SHOP the order was placed in and not at the engine's own domain.
 */
export default async function orderPlacedEmailHandler({
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
    template: "order-placed",
    idempotencyKey: `order-placed:${order.id}`,
    Component: OrderPlacedEmail,
    subjectKey: "OrderPlaced.subject",
    text: (t, id, shop) =>
      [
        t("OrderPlaced.textFallback", { id }),
        "",
        t("OrderPlaced.watchStatus"),
        "",
        `${shop.storefrontUrl}/account/orders`,
      ].join("\n"),
  });
}

export const config: SubscriberConfig = {
  event: ["order.placed"],
};
