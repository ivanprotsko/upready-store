import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { deleteTenantSecretSlot, writeTenantSecretSlot } from "../../../tenant-secrets/slot";
import { maskTelegramBotSettings, readTelegramBotSecret } from "../../../tenant-secrets/telegram";
import { createBotApi, TelegramBotApiError } from "../../../telegram/bot-api";
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

const view = async (req: AuthenticatedMedusaRequest) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readTelegramBotSecret(pg, tenant.id, { includeDisabled: true });
  return {
    provider: "telegram" as const,
    label: "Telegram",
    settings: secret ? maskTelegramBotSettings(secret) : null,
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
