import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { accessPasswordHashFromEnv } from "../../../../../shop-bot/access-gate";
import { createMedusaShop } from "../../../../../shop-bot/medusa-shop";
import { claimUpdate } from "../../../../../shop-bot/updates";
import {
  managerLinkCode,
  TELEGRAM_SECRET_HEADER,
  webhookSecretMatches,
} from "../../../../../shop-bot/webhook-secret";
import { handleUpdate } from "../../../../../shop-bot/router";
import type { ShopBotContext, TgUpdate } from "../../../../../shop-bot/types";
import { normalizeLocale, shopBotStorefrontUrl } from "../../../../../shop-bot/storefront-url";
import { readUsableTelegramBot } from "../../../../../tenant-secrets/telegram";
import { createBotApi } from "../../../../../telegram/bot-api";

/**
 * `POST /telegram/bot/:tenantHandle/webhook` (t-cherk-23, phase 1). Telegram's
 * only way in: no session, just the `secret_token` Telegram was given back
 * when `POST /tenants/telegram-bot/webhook` called `setWebhook` with
 * `${BACKEND_PUBLIC_URL}/telegram/bot/${tenant.handle}/webhook`
 * (`../../../../tenants/telegram-bot/webhook/route.ts`).
 *
 * An unknown handle or an unconfigured bot is 404 — nothing about this shop
 * to tell Telegram apart from. A wrong or missing secret is 401 — this
 * request did not come from Telegram for this shop's bot, no detail in the
 * body either way. Every OTHER failure still answers 200: once Telegram is
 * confirmed to be the caller, a non-200 only buys an endless retry storm, so
 * a repeat `update_id` is dropped quietly and an error inside `handleUpdate`
 * is logged (never the bot token) and swallowed here.
 */

type RawTenant = {
  id?: string;
  handle?: string;
  name?: string | null;
  sales_channel?: { id?: string | null } | null;
  locale_settings?: { default_locale?: string | null; default_country?: string | null } | null;
  domains?: Array<{ host?: string | null; is_primary?: boolean | null }> | null;
};

export const POST = async (req: MedusaRequest<TgUpdate>, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenantHandle = (req.params as Record<string, string>).tenantHandle ?? "";

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "handle",
      "name",
      "sales_channel.id",
      "locale_settings.default_locale",
      "locale_settings.default_country",
      "domains.host",
      "domains.is_primary",
    ],
    filters: { handle: tenantHandle },
  });

  const resolvedTenant = tenant as RawTenant | undefined;
  if (!resolvedTenant?.id || !resolvedTenant.handle || !resolvedTenant.sales_channel?.id) {
    res.status(404).json({});
    return;
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const bot = await readUsableTelegramBot(pg, resolvedTenant.id);
  if (!bot || !bot.credentials.webhook_secret) {
    res.status(404).json({});
    return;
  }

  if (
    !webhookSecretMatches(
      bot.credentials.webhook_secret,
      req.headers[TELEGRAM_SECRET_HEADER],
    )
  ) {
    res.status(401).json({});
    return;
  }

  const update = req.body;
  if (typeof update?.update_id !== "number") {
    // Not a shape Telegram sends; nothing to claim or act on.
    res.status(200).json({ ok: true });
    return;
  }

  const isNew = await claimUpdate(pg, resolvedTenant.id, update.update_id);
  if (!isNew) {
    res.status(200).json({ ok: true });
    return;
  }

  const primaryDomain =
    resolvedTenant.domains?.find((domain) => domain.is_primary && domain.host)?.host ?? null;
  const locale = normalizeLocale(resolvedTenant.locale_settings?.default_locale);

  const context: ShopBotContext = {
    api: createBotApi({ token: bot.credentials.token }),
    shop: createMedusaShop(req.scope, {
      id: resolvedTenant.id,
      salesChannelId: resolvedTenant.sales_channel.id,
      defaultCountry: resolvedTenant.locale_settings?.default_country ?? null,
    }),
    locale,
    shopName: resolvedTenant.name || resolvedTenant.handle,
    botUsername: bot.credentials.username,
    storefrontUrl: shopBotStorefrontUrl({ handle: resolvedTenant.handle, primaryDomain, locale }),
    managerChatId: bot.credentials.manager_chat_id ?? null,
    managerLinkCode: managerLinkCode(bot.credentials.webhook_secret),
    accessPasswordHash: accessPasswordHashFromEnv(),
  };

  try {
    await handleUpdate(update, context);
  } catch (error) {
    logger.error(
      `[shop-bot] update ${update.update_id} for tenant ${resolvedTenant.id} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  res.status(200).json({ ok: true });
};
