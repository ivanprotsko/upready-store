import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ensureSettings, type ShopNotificationSettings } from "../../../tenant-notifications/shop";
import { botToken, botUsername } from "../../../tenant-notifications/telegram";
import { isUsable } from "../../../tenant-notifications/link-code";
import { getTenantScope } from "../tenant-scope";

/**
 * The shape the panel reads (`GET /tenants/notification-settings`,
 * t08-order-notifications).
 *
 * The pending link CODE is never in it. A code is proof of ownership of the
 * chat binding, so it leaves the backend exactly once, in the answer to the
 * request that minted it, and the panel shows the deep link built from it
 * rather than storing the code anywhere.
 */
export type NotificationSettingsResponse = {
  settings: {
    email: {
      from_name: string | null;
      reply_to: string | null;
      /** What the customer's inbox will actually show, once the fallbacks are applied. */
      effective_from_name: string;
      /** False when the deployment has no SMTP account: nothing will be sent. */
      configured: boolean;
      last: DeliveryView;
    };
    telegram: {
      connected: boolean;
      chat_title: string | null;
      linked_at: Date | null;
      /** A code minted earlier and still usable — the panel keeps showing its link. */
      pending_link: boolean;
      /** False when the deployment has no bot token: nothing will be sent. */
      configured: boolean;
      bot_username: string;
      last: DeliveryView;
    };
  };
  shop: { name: string; storefront_url: string };
};

export type DeliveryView = {
  status: "ok" | "failed" | null;
  at: Date | null;
  error: string | null;
  order: string | null;
};

const deliveryView = (
  row: Record<string, unknown> | null,
  channel: "email" | "telegram",
): DeliveryView => ({
  status: (row?.[`${channel}_last_status`] as "ok" | "failed" | null) ?? null,
  at: (row?.[`${channel}_last_at`] as Date | null) ?? null,
  error: (row?.[`${channel}_last_error`] as string | null) ?? null,
  order: (row?.[`${channel}_last_order`] as string | null) ?? null,
});

export const notificationSettingsView = (
  settings: ShopNotificationSettings,
  shop: { name: string; storefrontUrl: string },
  now: Date = new Date(),
): NotificationSettingsResponse => ({
  settings: {
    email: {
      from_name: settings.email_from_name ?? null,
      reply_to: settings.email_reply_to ?? null,
      effective_from_name: settings.email_from_name || shop.name,
      configured: Boolean(process.env.SMTP_HOST),
      last: deliveryView(settings as unknown as Record<string, unknown>, "email"),
    },
    telegram: {
      connected: Boolean(settings.telegram_chat_id),
      chat_title: settings.telegram_chat_title ?? null,
      linked_at: settings.telegram_linked_at ?? null,
      pending_link: isUsable(settings, now),
      configured: Boolean(botToken()),
      bot_username: botUsername(),
      last: deliveryView(settings as unknown as Record<string, unknown>, "telegram"),
    },
  },
  shop: { name: shop.name, storefront_url: shop.storefrontUrl },
});

/** The caller's own row, created on first read so the panel never sees a 404. */
export const ownSettings = async (
  req: AuthenticatedMedusaRequest,
): Promise<{ tenant: Awaited<ReturnType<typeof getTenantScope>>; settings: ShopNotificationSettings }> => {
  const tenant = await getTenantScope(req);
  const settings = await ensureSettings(req.scope, tenant.id);
  return { tenant, settings };
};
