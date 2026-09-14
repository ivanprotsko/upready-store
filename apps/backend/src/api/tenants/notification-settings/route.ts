import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { resolveShopForTenant } from "../../../tenant-notifications/shop";
import type { PutTenantNotificationSettingsBody } from "../validators";
import { notificationSettingsView, ownSettings } from "./helpers";

/**
 * `GET /tenants/notification-settings` — who hears about this shop's orders
 * (t08-order-notifications): the sender identity of the customer's letters, the
 * state of the owner's Telegram, and the last delivery of each channel. A
 * failure the owner cannot see is a failure nobody fixes (rule 20a), so the
 * last attempt of both channels is part of this answer.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { tenant, settings } = await ownSettings(req);
  const shop = await resolveShopForTenant(req.scope, tenant.id);
  res.json(notificationSettingsView(settings, shop));
};

/**
 * `PUT /tenants/notification-settings` — the two fields the owner controls.
 * The `From` ADDRESS is not among them on purpose: the platform's SMTP account
 * does the sending, and a shop cannot make it claim a domain we cannot sign for.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantNotificationSettingsBody>,
  res: MedusaResponse,
) => {
  const { tenant, settings } = await ownSettings(req);
  const body = req.validatedBody;

  await req.scope.resolve<TenantModuleService>(TENANT_MODULE).updateTenantNotificationSettings({
    id: settings.id,
    // An empty string is «clear it», not «keep it»: the owner has to be able to
    // take a reply-to address back off the letters.
    ...(body.email_from_name !== undefined ? { email_from_name: body.email_from_name || null } : {}),
    ...(body.email_reply_to !== undefined ? { email_reply_to: body.email_reply_to || null } : {}),
  });

  const { settings: saved } = await ownSettings(req);
  const shop = await resolveShopForTenant(req.scope, tenant.id);
  res.json(notificationSettingsView(saved, shop));
};
