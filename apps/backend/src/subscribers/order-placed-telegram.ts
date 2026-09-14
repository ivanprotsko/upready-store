import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { recordDelivery } from "../tenant-notifications/delivery-status";
import { formatOrderMessage, type OwnerOrder } from "../tenant-notifications/order-message";
import { defaultOwnerLocale } from "../tenant-notifications/owner-messages";
import { resolveShopForOrder } from "../tenant-notifications/shop";
import { panelOrderUrl } from "../tenant-notifications/storefront-origin";
import { botToken, sendTelegramMessage } from "../tenant-notifications/telegram";

/**
 * The shop OWNER hears about a new order (t08-order-notifications).
 *
 * It follows the same `order.placed` event as the customer's letter and sits
 * next to it on purpose: one event, two audiences. Nothing here can fail the
 * order — the event has already fired, the customer has already paid, and an
 * unreachable Telegram is a delivery problem, not a commerce one. Every exit
 * writes a line naming the order, and the outcome is stored on the shop's row
 * so the panel can show it (rule 20a: silence is not an acceptable outcome).
 *
 * Isolation: the chat is read from the row of the tenant the ORDER is linked
 * to, never from a list of chats. Tenant B's owner cannot be in tenant A's row.
 */
export default async function orderPlacedTelegramHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tag = "order-placed-telegram";

  const orderId = event.data.id;
  if (!orderId) {
    logger.warn(`[${tag}] Missing order id in event payload`);
    return;
  }

  const shop = await resolveShopForOrder(container, orderId);
  const chatId = shop.settings?.telegram_chat_id ?? null;

  if (!chatId) {
    logger.info(
      `[${tag}] Order ${orderId}: the shop ${shop.tenantId ?? "(platform)"} has no Telegram chat linked, skipping`,
    );
    return;
  }

  const token = botToken();
  if (!token) {
    logger.error(
      `[${tag}] Order ${orderId}: TELEGRAM_BOT_TOKEN is not set, the owner of shop ${shop.tenantId} will not hear about it`,
    );
    await recordDelivery(container, shop.tenantId, "telegram", {
      status: "failed",
      error: "TELEGRAM_BOT_TOKEN is not set",
      order: orderId,
    });
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "shipping_total",
      "metadata",
      "items.title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "shipping_methods.name",
      "shipping_methods.amount",
      "shipping_address.*",
      "billing_address.*",
      "customer.phone",
      "customer.email",
    ],
    filters: { id: orderId },
  });

  const order = orders[0] as OwnerOrder | undefined;
  if (!order) {
    logger.warn(`[${tag}] Order not found: ${orderId}`);
    return;
  }

  const label = String(order.display_id ?? order.id);
  const text = formatOrderMessage({
    order,
    shopName: shop.name,
    locale: defaultOwnerLocale(),
    panelUrl: panelOrderUrl(order.id),
  });

  try {
    const sent = await sendTelegramMessage(token, chatId, text);
    logger.info(
      `[${tag}] Order ${label} (${order.id}) announced to chat ${chatId} of shop ${shop.tenantId}, message ${sent.message_id}`,
    );
    await recordDelivery(container, shop.tenantId, "telegram", { status: "ok", order: label });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(
      `[${tag}] Order ${label} (${order.id}) of shop ${shop.tenantId} was NOT announced to chat ${chatId}: ${reason}`,
    );
    await recordDelivery(container, shop.tenantId, "telegram", {
      status: "failed",
      error: reason,
      order: label,
    });
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed"],
};
