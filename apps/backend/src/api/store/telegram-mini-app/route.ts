import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import { readStoreRecord } from "../../../telegram/store-record";

/**
 * `GET /store/telegram-mini-app` — the launch links of the store's Mini App, for
 * the storefront to show an "open in Telegram" affordance and for acceptance
 * checks. Behind the publishable-key gate like every `/store/*` route; never
 * carries the token.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
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
