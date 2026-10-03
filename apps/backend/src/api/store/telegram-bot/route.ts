import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { botIdFromToken, readTelegramBotSecret } from "../../../tenant-secrets/telegram";
import { resolveTenantFromPublishableKey } from "../tenant/resolve-tenant";

/**
 * `GET /store/telegram-bot` — whether THIS shop has a Telegram bot, and its
 * public username and numeric id (t-2026-10-02-telegram-auth). Never the token: `username` is
 * what the Login Widget's `data-telegram-login` attribute needs and what a
 * Mini App deep link already shows the buyer, so it is the one field this
 * route is happy to hand back in full.
 *
 * A shop with no bot, or a disabled one, answers `{ bot: null }` — the
 * storefront renders no Telegram button at all rather than a broken one
 * (brief: «A shop with no bot shows no Telegram button»).
 *
 * No auth: this is the same kind of public fact `/store/tenant/*` and
 * `/tenants/login-settings`'s storefront-facing twin already answer without a
 * session, read straight off the publishable key every storefront call
 * already carries.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  let tenant;
  try {
    tenant = await resolveTenantFromPublishableKey(req);
  } catch {
    res.json({ bot: null });
    return;
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readTelegramBotSecret(pg, tenant.id);

  const botId = secret?.credentials.token ? botIdFromToken(secret.credentials.token) : null;

  res.json({
    bot: secret && secret.credentials.username && botId
      ? { username: secret.credentials.username, id: botId }
      : null,
  });
};
