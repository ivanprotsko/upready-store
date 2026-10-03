import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../tenant-secrets/slot";
import { maskTelegramBotSettings, readTelegramBotSecret } from "../../../tenant-secrets/telegram";
import { createBotApi, TelegramBotApiError } from "../../../telegram/bot-api";
import { managerLinkCode } from "../../../shop-bot/webhook-secret";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantTelegramBotBody } from "../validators";

/**
 * `GET|PUT|DELETE /tenants/telegram-bot` — the shop's own Telegram bot,
 * entered by its owner (t-2026-10-02-telegram-auth). Same shape and the same
 * ONE writer (`tenant-secrets/slot.ts`) every other self-service key route
 * uses (`/tenants/apiship/key`, the closest template: a single secret slot
 * with no marketplace-adapter abstraction behind it).
 *
 * WHAT NEVER LEAVES THIS FILE: the token. The response is the read-back state
 * (`{ username, token: { set, last4 } }`), and an error names the FIELD, never
 * the typed value.
 *
 * WHY `PUT` CALLS TELEGRAM. A bot token typo is the chrxnasdmds incident this
 * task is explicitly asked to not repeat (`b553c540`): the token that will key
 * every buyer's HMAC check is verified with `getMe` BEFORE the row is written,
 * so a wrong token fails loudly here, in the panel, rather than silently at a
 * buyer's sign-in click. `getMe` is a read: this route never calls
 * `setChatMenuButton` or registers a webhook.
 */

/**
 * `bot.webhook_connected` / `manager_link` (t-cherk-23): read straight off the
 * slot's own `webhook_secret` and `manager_chat_id`, never a separate flag, so
 * the two routes that write the slot (this file's `PUT`/`DELETE` and
 * `webhook/route.ts`'s `POST`/`DELETE`) cannot drift from what the view shows.
 * `manager_link` is built, never stored: the code inside it is derived from
 * `webhook_secret` (`managerLinkCode`), so it rotates with every
 * re-provision without a second column to keep in step.
 */
export const view = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readTelegramBotSecret(pg, tenant.id, { includeDisabled: true });
  const credentials = secret?.credentials;
  const webhookSecret = credentials?.webhook_secret;
  return {
    provider: "telegram" as const,
    label: "Telegram",
    settings: secret ? maskTelegramBotSettings(secret) : null,
    bot: {
      webhook_connected: Boolean(webhookSecret),
      manager_linked: Boolean(credentials?.manager_chat_id),
      manager_link:
        webhookSecret && credentials?.username
          ? `https://t.me/${credentials.username}?start=mgr_${managerLinkCode(webhookSecret)}`
          : null,
    },
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await view(req));
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantTelegramBotBody>,
  res: MedusaResponse,
) => {
  const body = req.validatedBody;

  let botUsername: string | undefined;
  try {
    const bot = await createBotApi({ token: body.token }).getMe();
    botUsername = bot.result.username;
  } catch (error) {
    const description =
      error instanceof TelegramBotApiError ? error.description : (error as Error).message;
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Этот токен не принят Telegram (${description}). Проверьте токен бота в @BotFather.`,
    );
  }

  if (botUsername && botUsername.toLowerCase() !== body.username.toLowerCase()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Этот токен принадлежит боту @${botUsername}, а не @${body.username}. Проверьте имя пользователя.`,
    );
  }

  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  // A full replace, not a merge: a new token drops `webhook_secret` and
  // `manager_chat_id` on purpose (t-cherk-23) — a replaced bot must be
  // re-connected through «Подключить бота», never keep the old bot's webhook
  // pointed at Telegram under a token that no longer owns it.
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "telegram",
    credentials: { username: botUsername ?? body.username, token: body.token },
    isEnabled: true,
  });

  res.json(await view(req));
};

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const removed = await deleteTenantSecretSlot(pg, tenantModule, tenant.id, "telegram");
  res.json({ ...(await view(req)), id: removed.id, deleted: removed.deleted });
};
