import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { resolveShopForTenant } from "../../../../tenant-notifications/shop";
import { notificationSettingsView, ownSettings } from "../helpers";

/**
 * `DELETE /tenants/notification-settings/telegram` — «Отключить»
 * (t08-order-notifications). The chat is forgotten and any pending code with
 * it, so a link the owner half-finished cannot bind a chat afterwards.
 *
 * The last delivery status stays: what happened, happened, and hiding it would
 * be the silence rule 20a forbids.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { tenant, settings } = await ownSettings(req);

  await req.scope.resolve<TenantModuleService>(TENANT_MODULE).updateTenantNotificationSettings({
    id: settings.id,
    telegram_chat_id: null,
    telegram_chat_title: null,
    telegram_linked_at: null,
    link_code: null,
    link_code_expires_at: null,
  });

  const { settings: saved } = await ownSettings(req);
  const shop = await resolveShopForTenant(req.scope, tenant.id);
  res.json(notificationSettingsView(saved, shop));
};
