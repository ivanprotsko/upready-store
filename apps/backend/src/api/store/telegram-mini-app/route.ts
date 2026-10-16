import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { readStoreRecord } from "../../../telegram/store-record";
import { botChatUrl, mainMiniAppUrl } from "../../../telegram/mini-app";
import { readTelegramBotSecret } from "../../../tenant-secrets/telegram";
import { shopMiniAppEntry, type ShopQuery } from "../../../shop-bot/storefront-url";
import { resolveTenantFromPublishableKey, type StoreTenant } from "../tenant/resolve-tenant";

/**
 * `GET /store/telegram-mini-app` — the launch links of the store's Mini App, for
 * the storefront to show an "open in Telegram" affordance and for acceptance
 * checks. Behind the publishable-key gate like every `/store/*` route; never
 * carries the token.
 *
 * A key with a shop behind it answers from that shop's own bot, the one its
 * owner saved under «Настройки → Бот в Telegram» (`/tenants/telegram-bot`).
 * `store.metadata` is one document for every shop of a multi-tenant engine, so
 * reading it there answered `null` for cherkashino.com while its bot was
 * connected, and would have shown one shop's bot to all of them
 * (t-2026-10-16-38). `menu_button_url` is set once «Подключить бота» has run,
 * because that is the call that sets the menu button. `main_mini_app_url` opens
 * only after the Main Mini App is enabled in @BotFather, which no Bot API call
 * can do or read. A key with no shop behind it (a single-store install) keeps
 * the store-wide record the admin route provisions.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  let tenant: StoreTenant | null = null;
  try {
    tenant = await resolveTenantFromPublishableKey(req);
  } catch {
    tenant = null;
  }

  if (tenant) {
    const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
    const secret = await readTelegramBotSecret(pg, tenant.id);
    const username = secret?.credentials.username;
    if (!secret?.credentials.token || !username) {
      res.status(200).json({ mini_app: null });
      return;
    }
    const menuButtonUrl = secret.credentials.webhook_secret
      ? (await shopMiniAppEntry(req.scope.resolve<ShopQuery>(ContainerRegistrationKeys.QUERY), tenant.handle)).url
      : null;
    res.status(200).json({
      mini_app: {
        bot_username: username,
        chat_url: botChatUrl(username),
        main_mini_app_url: mainMiniAppUrl(username),
        menu_button_url: menuButtonUrl,
        provisioned_at: null,
      },
    });
    return;
  }

  const { record } = await readStoreRecord(req);
  res.status(200).json({
    mini_app: record
      ? {
          bot_username: record.botUsername,
          chat_url: record.launch.chatUrl,
          main_mini_app_url: record.launch.mainMiniAppUrl,
          menu_button_url: record.launch.menuButton.url,
          provisioned_at: record.provisionedAt,
        }
      : null,
  });
}
