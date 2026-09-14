import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { recordDelivery } from "../../../../../tenant-notifications/delivery-status";
import {
  defaultOwnerLocale,
  ownerText,
} from "../../../../../tenant-notifications/owner-messages";
import { resolveShopForTenant } from "../../../../../tenant-notifications/shop";
import { botToken, sendTelegramMessage } from "../../../../../tenant-notifications/telegram";
import { ownSettings } from "../../helpers";

/**
 * `POST /tenants/notification-settings/telegram/test` — the «Проверить» button
 * (t08-order-notifications). It sends a real message through the real bot to
 * the linked chat, because the only proof a channel works is a message that
 * arrived (rule 18f).
 *
 * The attempt is recorded like any other delivery, so a failure shows up on the
 * owner's own screen and not only in this response.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { tenant, settings } = await ownSettings(req);
  const chatId = settings.telegram_chat_id;

  if (!chatId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Telegram is not linked for this shop yet.",
    );
  }

  const token = botToken();
  if (!token) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "The platform bot is not configured on this deployment (TELEGRAM_BOT_TOKEN).",
    );
  }

  const shop = await resolveShopForTenant(req.scope, tenant.id);
  const locale = defaultOwnerLocale();
  const text = [
    ownerText(locale, "testTitle"),
    "",
    ownerText(locale, "testBody", { shop: shop.name }),
  ].join("\n");

  try {
    const sent = await sendTelegramMessage(token, chatId, text);
    await recordDelivery(req.scope, tenant.id, "telegram", { status: "ok", order: null });
    res.json({ sent: true, message_id: sent.message_id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordDelivery(req.scope, tenant.id, "telegram", {
      status: "failed",
      error: reason,
      order: null,
    });
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, reason);
  }
};
