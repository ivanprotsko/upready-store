import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  OrderShipmentCreatedEmail,
  type FulfillmentLabel,
} from "../emails/order-shipment-created";
import {
  findOrderForEmail,
  sendOrderEmail,
  suppressedByAdmin,
} from "../emails/lib/notify";

const TAG = "order-shipped-email";

/**
 * `shipment.created` is the event that actually means "shipped", and it is the
 * first point at which a tracking number exists. Its payload carries only the
 * fulfillment id, so the order is resolved through `fulfillments.id`.
 */
export default async function orderShipmentCreatedEmailHandler({
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

  const order = await findOrderForEmail(
    container,
    { fulfillments: { id: fulfillmentId } },
    [
      "fulfillments.id",
      "fulfillments.metadata",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
  );

  if (!order) {
    logger.warn(`[${TAG}] No order linked to fulfillment: ${fulfillmentId}`);
    return;
  }

  const fulfillments = (order.fulfillments ?? []) as Array<{
    id: string;
    labels?: FulfillmentLabel[];
    metadata?: Record<string, unknown> | null;
  }>;
  const fulfillment = fulfillments.find((f) => f.id === fulfillmentId);
  const labels = fulfillment?.labels ?? [];
  // The carrier the owner typed in the panel next to the tracking number
  // (`POST /tenants/orders/:id/fulfillments/:fid/shipments`, `metadata.carrier`).
  const carrierRaw = fulfillment?.metadata?.carrier;
  const carrier = typeof carrierRaw === "string" && carrierRaw.trim() ? carrierRaw.trim() : null;

  await sendOrderEmail({
    container,
    tag: TAG,
    eventName: event.name,
    order,
    template: "order-shipped",
    idempotencyKey: `order-shipped:${order.id}:${fulfillmentId}`,
    Component: OrderShipmentCreatedEmail,
    props: { labels, carrier },
    subjectKey: "Shipment.subject",
    text: (t, id, shop) => {
      const numbers = labels
        .map((label) => label.tracking_number)
        .filter(Boolean)
        .map((number) => (carrier ? `${carrier} ${number}` : number))
        .join(", ");

      return [
        t("Shipment.textFallback", { id }),
        numbers ? t("Shipment.textTracking", { numbers }) : "",
        "",
        t("Shipment.textDelivery"),
        "",
        `${shop.storefrontUrl}/account/orders`,
      ].join("\n");
    },
  });
}

export const config: SubscriberConfig = {
  event: "shipment.created",
};
