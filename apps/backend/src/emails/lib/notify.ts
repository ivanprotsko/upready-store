import type { MedusaContainer } from "@medusajs/framework";
import type {
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createElement, type ComponentType } from "react";
import {
  type EmailLocale,
  type EmailTranslator,
  getEmailTranslator,
  getLocaleFromMetadata,
  resolveEmailLocale,
} from "../i18n";
import { recordDelivery } from "../../tenant-notifications/delivery-status";
import { resolveShopForOrder, type ShopIdentity } from "../../tenant-notifications/shop";
import { type EmailShop, renderForShop } from "./shop";

/**
 * The shop identity a template renders under. `contactEmail` is what the
 * letter's footer offers the customer to write to, and it is the owner's
 * reply-to address when they set one (t08-order-notifications).
 */
export const emailShopFrom = (shop: ShopIdentity): EmailShop => ({
  name: shop.name,
  storefrontUrl: shop.storefrontUrl,
  email: shop.contactEmail,
  address: process.env.STORE_ADDRESS || "",
  phone: process.env.STORE_PHONE || "",
});

/**
 * Shared plumbing for the order emails. Each subscriber differs only in which
 * order it looks up, which template it renders and what the plain-text part
 * says, so everything around that lives here once.
 */

/** The fields every order template reads, plus what locale resolution needs. */
export const ORDER_EMAIL_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "currency_code",
  "locale",
  "customer.metadata",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.address_1",
  "shipping_address.city",
  "shipping_address.country_code",
];

export type OrderForEmail = {
  id: string;
  display_id?: number | string;
  email?: string;
  customer_id?: string | null;
  locale?: string | null;
  customer?: { metadata?: Record<string, unknown> | null } | null;
  [key: string]: unknown;
};

/**
 * Looks an order up by whatever the event gave us. `shipment.created` and
 * `delivery.created` carry only a fulfillment id, so they filter on
 * `fulfillments.id` instead of the order's own.
 */
export async function findOrderForEmail(
  container: MedusaContainer,
  filters: Record<string, unknown>,
  extraFields: string[] = [],
): Promise<OrderForEmail | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [...ORDER_EMAIL_FIELDS, ...extraFields],
    filters,
  });

  return (orders[0] as OrderForEmail | undefined) ?? null;
}

type SendOrderEmailOptions<P> = {
  container: MedusaContainer;
  /** Prefixes every log line, for example `order-shipped-email` */
  tag: string;
  /** The event name, stored on the notification as `trigger_type` */
  eventName: string;
  order: OrderForEmail;
  /** Notification template id, for example `order-shipped` */
  template: string;
  /** Makes repeated deliveries of the same event a no-op */
  idempotencyKey: string;
  Component: ComponentType<P>;
  /** Everything the template needs besides `order` and `locale` */
  props?: Omit<P, "order" | "locale">;
  /** Message key holding the subject line, for example `Shipment.subject` */
  subjectKey: string;
  /**
   * Builds the plain-text alternative. It receives the SHOP as well, because a
   * link in the text part is a customer-facing URL like any other and must
   * point at the shop the order belongs to, not at the engine.
   */
  text: (t: EmailTranslator["t"], id: string | number, shop: EmailShop) => string;
};

/**
 * Renders a template and hands it to the Notification Module. Returns whether
 * anything was sent, so a caller can log its own reason for skipping.
 */
export async function sendOrderEmail<P extends object>({
  container,
  tag,
  eventName,
  order,
  template,
  idempotencyKey,
  Component,
  props,
  subjectKey,
  text,
}: SendOrderEmailOptions<P>): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const notificationService = container.resolve(
    Modules.NOTIFICATION,
  ) as INotificationModuleService;

  if (!order.email) {
    logger.warn(`[${tag}] No email on order ${order.id}, skipping`);
    return false;
  }

  const locale: EmailLocale = resolveEmailLocale(
    order.locale,
    getLocaleFromMetadata(order.customer?.metadata),
  );
  const { t } = getEmailTranslator(locale);
  const id = order.display_id ?? order.id;

  // WHICH shop this order belongs to decides both the links inside the letter
  // and the name the inbox shows. One resolution per letter, used by the HTML,
  // the text part and the sender identity alike.
  const shop = await resolveShopForOrder(container, order.id);
  const emailShop = emailShopFrom(shop);

  const html = await renderForShop(
    emailShop,
    createElement(Component, { ...(props ?? {}), order, locale } as P),
  );

  try {
    await notificationService.createNotifications({
      to: order.email,
      channel: "email",
      template,
      trigger_type: eventName,
      resource_id: order.id,
      resource_type: "order",
      receiver_id: order.customer_id || undefined,
      idempotency_key: idempotencyKey,
      content: {
        subject: t(subjectKey, { id }),
        html,
        text: text(t, id, emailShop),
      },
      // Read by the SMTP provider: the display name and the reply-to address of
      // this shop. The `From` ADDRESS stays the platform's — letting a shop set
      // its own is what SPF and DMARC reject and what an abuser asks for first.
      data: {
        sender: {
          name: shop.fromName,
          reply_to: shop.replyTo,
        },
      },
    } as Parameters<INotificationModuleService["createNotifications"]>[0]);

    logger.info(
      `[${tag}] Sent to ${order.email} for order ${order.id} (locale: ${locale}, shop: ${
        shop.tenantId ?? "platform"
      }, links: ${emailShop.storefrontUrl})`,
    );
    await recordDelivery(container, shop.tenantId, "email", {
      status: "ok",
      order: String(id),
    });
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Both ends, always (rule 20a): the operator's log names the order, and the
    // owner sees the failed attempt on their own notifications screen.
    logger.error(
      `[${tag}] Failed to send the letter for order ${order.id} to ${order.email}: ${reason}`,
    );
    await recordDelivery(container, shop.tenantId, "email", {
      status: "failed",
      error: reason,
      order: String(id),
    });
    return false;
  }
}

/**
 * The Admin offers a "do not notify the customer" checkbox on every fulfillment
 * action, and Medusa forwards it on the event as `no_notification`. Only the
 * fulfillment family carries the flag; `order.placed` and `order.completed`
 * have nothing to check.
 */
export function suppressedByAdmin(
  container: MedusaContainer,
  tag: string,
  data: { no_notification?: boolean } | undefined,
  orderId: string,
): boolean {
  if (!data?.no_notification) {
    return false;
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  logger.info(
    `[${tag}] Suppressed for order ${orderId}: the Admin asked not to notify the customer`,
  );
  return true;
}
