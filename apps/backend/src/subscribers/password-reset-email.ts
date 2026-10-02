import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type {
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { render } from "@react-email/render";
import { createElement } from "react";
import { PasswordResetEmail } from "../emails/password-reset";
import {
  getEmailTranslator,
  getLocaleFromMetadata,
  resolveEmailLocale,
} from "../emails/i18n";
import { emailShopFrom } from "../emails/lib/notify";
import { renderForShop } from "../emails/lib/shop";
import { panelResetPasswordUrl } from "../tenant-notifications/storefront-origin";
import { lastOrderTenantId, resolveShopForTenantId, tenantIdFromMetadata } from "../tenant-notifications/shop";

export default async function passwordResetEmailHandler({
  event,
  container,
}: SubscriberArgs<{
  entity_id: string;
  token: string;
  actor_type: string;
  metadata?: Record<string, unknown>;
}>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const { entity_id: email, token, actor_type, metadata } = event.data;

  // f14-no-password-reset: the tenant panel's login screen had no
  // reset-password link at all, because this handler — the only place that
  // ever turns `auth.password_reset` into a real email — stopped at
  // `actor_type === "customer"`. `tenant` is the actor type the panel
  // authenticates as (`modules/tenant/index.ts`), so it is added alongside.
  if (actor_type !== "customer" && actor_type !== "tenant") {
    return;
  }

  if (!email || !token) {
    logger.warn(
      "[password-reset-email] Missing email or token in event payload",
    );
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const notificationService = container.resolve(
    Modules.NOTIFICATION,
  ) as INotificationModuleService;

  let storedRow: { id?: string; metadata?: Record<string, unknown> | null } | undefined;

  try {
    const { data: rows } = await query.graph({
      entity: actor_type === "tenant" ? "tenant_admin" : "customer",
      fields: ["id", "metadata"],
      filters: { email },
    } as any);
    storedRow = rows[0] as { id?: string; metadata?: Record<string, unknown> | null } | undefined;
  } catch (error) {
    logger.warn(
      `[password-reset-email] Could not read the stored ${actor_type} row for ${email}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const locale = resolveEmailLocale(
    getLocaleFromMetadata(metadata),
    getLocaleFromMetadata(storedRow?.metadata),
  );
  const { t } = getEmailTranslator(locale);

  // WHICH shop a CUSTOMER'S reset link opens. Never the request's own
  // publishable key: any shop owner can request a reset for someone else's
  // e-mail through THEIR OWN key, and the request is otherwise
  // indistinguishable from a legitimate one — a security review of this task
  // found that a reset mailed under a trusted, DKIM-signed identity would
  // still carry a link (and the token in it) to the REQUESTER's own domain,
  // readable off their own analytics. The only two trustworthy sources left:
  // the shop recorded on the customer's OWN row at registration
  // (`inject-tenant-metadata.ts`, `customer.metadata.tenant_id`, which the
  // buyer's own profile update cannot rewrite — `strip-tenant-metadata.ts`),
  // or, for a customer who predates that metadata, the shop of their most
  // recent order (`lastOrderTenantId`). The panel (tenant) branch addresses
  // one specific tenant already and never resolves a shop here, exactly as
  // before this task.
  const customerTenantId =
    actor_type === "customer" && storedRow?.id
      ? tenantIdFromMetadata(storedRow.metadata) ?? (await lastOrderTenantId(container, storedRow.id))
      : null;
  const shop =
    actor_type === "customer" ? await resolveShopForTenantId(container, customerTenantId) : null;
  const emailShop = shop ? emailShopFrom(shop) : null;

  const resetUrl =
    actor_type === "tenant"
      ? panelResetPasswordUrl(token, email)
      : `${emailShop!.storefrontUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  if (!resetUrl) {
    // No `PANEL_PUBLIC_URL`/`DEMO_PANEL_URL` set on this deployment: mailing a
    // link with no host would be worse than not mailing at all (rule 20a —
    // a broken link is a silent failure dressed up as success).
    logger.warn(
      `[password-reset-email] No panel URL configured; skipped tenant reset email for ${email}`,
    );
    return;
  }

  const html = emailShop
    ? await renderForShop(
        emailShop,
        createElement(PasswordResetEmail, { email, token, resetUrl, locale }),
      )
    : await render(
        createElement(PasswordResetEmail, { email, token, resetUrl, locale }),
      );

  const text = t("PasswordReset.textFallback", { url: resetUrl });

  try {
    await notificationService.createNotifications({
      to: email,
      channel: "email",
      template: "password-reset",
      trigger_type: event.name,
      resource_id: email,
      resource_type: actor_type,
      idempotency_key: `password-reset:${actor_type}:${email}:${token}`,
      content: {
        subject: t("PasswordReset.subject"),
        html,
        text,
      },
      // Read by the SMTP provider, the same contract order letters use. Only
      // the customer branch has a shop to sign as; the panel letter keeps
      // whatever default sender the provider already applies.
      ...(shop
        ? {
            data: {
              sender: {
                name: shop.fromName,
                reply_to: shop.replyTo,
              },
            },
          }
        : {}),
    } as any);

    logger.info(
      `[password-reset-email] Sent to ${email} (locale: ${locale}, shop: ${
        shop ? (shop.tenantId ?? "platform") : "n/a"
      })`,
    );
  } catch (err: any) {
    logger.error(
      `[password-reset-email] Failed to send notification: ${err?.message}`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
