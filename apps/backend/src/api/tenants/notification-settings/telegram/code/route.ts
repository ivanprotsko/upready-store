import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import {
  expiresAtFrom,
  generateLinkCode,
  LINK_CODE_TTL_MS,
} from "../../../../../tenant-notifications/link-code";
import { deepLinkFor } from "../../../../../tenant-notifications/telegram";
import { ownSettings } from "../../helpers";

/**
 * `POST /tenants/notification-settings/telegram/code` — mint the one-time code
 * behind the «Подключить Telegram» button (t08-order-notifications).
 *
 * The answer carries the deep link the owner presses. Pressing it sends the
 * code to the bot as a `/start` payload, the bot hands it back through
 * `POST /telegram/link`, and the chat it arrived from becomes this shop's.
 * Minting again replaces the pending code, so the previous link stops working:
 * one shop never has two live codes.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { settings } = await ownSettings(req);

  const code = generateLinkCode();
  const now = new Date();
  const expiresAt = expiresAtFrom(now);

  await req.scope.resolve<TenantModuleService>(TENANT_MODULE).updateTenantNotificationSettings({
    id: settings.id,
    link_code: code,
    link_code_expires_at: expiresAt,
  });

  res.json({
    deep_link: deepLinkFor(code),
    expires_at: expiresAt,
    ttl_seconds: Math.round(LINK_CODE_TTL_MS / 1000),
  });
};
