import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type {
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createElement } from "react";
import { WelcomeEmail } from "../emails/welcome";
import {
  getEmailTranslator,
  getLocaleFromMetadata,
  resolveEmailLocale,
} from "../emails/i18n";
import { emailShopFrom } from "../emails/lib/notify";
import { renderForShop } from "../emails/lib/shop";
import { resolveShopForTenantId, tenantIdFromMetadata } from "../tenant-notifications/shop";

export default async function customerCreatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string } | { id: string }[]>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const payload = event.data;
  const ids = (Array.isArray(payload) ? payload : [payload])
    .map((entry) => entry?.id)
    .filter(Boolean);

  if (!ids.length) {
    logger.warn("[customer-created] No customer id in event payload");
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const notificationService = container.resolve(
    Modules.NOTIFICATION,
  ) as INotificationModuleService;

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "has_account", "metadata"],
    filters: { id: ids },
  });

  for (const customer of customers) {
    if (!customer.has_account) {
      continue;
    }

    if (!customer.email) {
      logger.warn(
        `[customer-created] No email for customer ${customer.id}, skipping`,
      );
      continue;
    }

    // WHICH shop this buyer signed up in decides both the links inside the
    // letter and the name the inbox shows, the same contract order letters
    // carry (`emails/lib/notify.ts`). `inject-tenant-metadata.ts` is the only
    // place that ever learns it, at `POST /store/customers` time, and stores
    // it on `customer.metadata.tenant_id` for want of a customer↔tenant link.
    const shop = await resolveShopForTenantId(
      container,
      tenantIdFromMetadata(customer.metadata),
    );
    const emailShop = emailShopFrom(shop);
    const shopUrl = `${emailShop.storefrontUrl}/store`;

    const locale = resolveEmailLocale(
      getLocaleFromMetadata(customer.metadata),
    );
    const { t } = getEmailTranslator(locale);

    const html = await renderForShop(
      emailShop,
      createElement(WelcomeEmail, {
        firstName: customer.first_name,
        shopUrl,
        locale,
      }),
    );
    const text = [
    t("Welcome.textFallback", { url: shopUrl }),
    "",
    `${t("Welcome.claimOrders")} ${emailShop.storefrontUrl}/account/orders`,
  ].join("\n");

    try {
      await notificationService.createNotifications({
        to: customer.email,
        channel: "email",
        template: "welcome",
        trigger_type: event.name,
        resource_id: customer.id,
        resource_type: "customer",
        receiver_id: customer.id,
        idempotency_key: `welcome:${customer.id}`,
        content: {
          subject: t("Welcome.subject"),
          html,
          text,
        },
        // Read by the SMTP provider, the same contract order letters use: the
        // display name and the reply-to address of this shop. The `From`
        // ADDRESS stays the platform's.
        data: {
          sender: {
            name: shop.fromName,
            reply_to: shop.replyTo,
          },
        },
      } as any);

      logger.info(
        `[customer-created] Welcome email sent to ${customer.email} (locale: ${locale}, shop: ${
          shop.tenantId ?? "platform"
        })`,
      );
    } catch (err: any) {
      logger.error(
        `[customer-created] Failed to send welcome email: ${err?.message}`,
      );
    }
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
};
