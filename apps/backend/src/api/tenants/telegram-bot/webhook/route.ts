import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { writeTenantSecretSlot } from "../../../../tenant-secrets/slot";
import { readUsableTelegramBot } from "../../../../tenant-secrets/telegram";
import { createBotApi, TelegramBotApiError } from "../../../../telegram/bot-api";
import { generateWebhookSecret } from "../../../../shop-bot/webhook-secret";
import { SHOP_BOT_COMMANDS } from "../../../../shop-bot/router";
import { getTenantScope } from "../../tenant-scope";
import { view } from "../route";

/**
 * `POST|DELETE /tenants/telegram-bot/webhook` — «Подключить бота» /
 * «Отключить» (t-cherk-23), separate from `PUT /tenants/telegram-bot` (the
 * token save). Provisioning the webhook is a second, independently-retryable
 * Telegram call: a flaky `setWebhook` must not force the owner to re-type the
 * token, and re-provisioning (the owner clicking «Переподключить» on an
 * already-connected bot) is the same `POST`, a fresh `webhook_secret` every
 * time.
 *
 * WHAT NEVER LEAVES THIS FILE: the token, same rule as `../route.ts`. A
 * Telegram failure answers 400 with Telegram's own `description`, never the
 * token or the typed secret.
 *
 * WHY THE PUBLIC URL IS NEVER GUESSED FROM THE REQUEST: the webhook Telegram's
 * servers call has to be an address reachable from OUTSIDE this deployment,
 * never the request's own `Host` header — that can be the compose network's
 * internal name (the panel reaches this engine over plain HTTP inside
 * `deploy/compose.mt.yml`). `BACKEND_PUBLIC_URL` (already the Robokassa result
 * URL's source, `../payment-settings/helpers.ts`) is read directly here with
 * no request-host fallback: unset is a loud 400 naming the variable, not a
 * silent wrong guess (the chrxnasdmds `b553c540` lesson).
 */

const publicBackendUrl = (): string => {
  const configured = process.env.BACKEND_PUBLIC_URL;
  if (!configured) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "BACKEND_PUBLIC_URL не задан на этом окружении: бот не может быть подключён без публичного адреса сервера.",
    );
  }
  return configured.replace(/\/+$/, "");
};

const telegramFailure = (action: string, error: unknown): MedusaError => {
  const description = error instanceof TelegramBotApiError ? error.description : (error as Error).message;
  return new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `Telegram не принял ${action} (${description}). Проверьте токен бота и повторите попытку.`,
  );
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const bot = await readUsableTelegramBot(pg, tenant.id);
  if (!bot) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "У магазина пока нет своего бота: сначала сохраните имя пользователя и токен бота выше.",
    );
  }

  const baseUrl = publicBackendUrl();
  const webhookSecret = generateWebhookSecret();
  const botApi = createBotApi({ token: bot.credentials.token });

  try {
    await botApi.setWebhook({
      url: `${baseUrl}/telegram/bot/${tenant.handle}/webhook`,
      secret_token: webhookSecret,
      allowed_updates: ["message", "callback_query", "inline_query"],
    });
    await botApi.setMyCommands(SHOP_BOT_COMMANDS("ru"));
  } catch (error) {
    // Telegram failed: the slot keeps the credentials it had before this
    // call, never a half-provisioned bot with a secret Telegram never agreed
    // to echo back.
    throw telegramFailure("вебхук", error);
  }

  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "telegram",
    credentials: {
      username: bot.credentials.username,
      token: bot.credentials.token,
      webhook_secret: webhookSecret,
      ...(bot.credentials.manager_chat_id === undefined
        ? {}
        : { manager_chat_id: bot.credentials.manager_chat_id }),
    },
    isEnabled: true,
  });

  res.json(await view(req));
};

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const bot = await readUsableTelegramBot(pg, tenant.id);

  if (bot?.credentials.webhook_secret) {
    try {
      await createBotApi({ token: bot.credentials.token }).deleteWebhook();
    } catch (error) {
      throw telegramFailure("отключение вебхука", error);
    }

    await writeTenantSecretSlot(pg, tenantModule, {
      tenantId: tenant.id,
      provider: "telegram",
      credentials: {
        username: bot.credentials.username,
        token: bot.credentials.token,
        // `webhook_secret` dropped on purpose: a disconnected bot carries no
        // secret for `managerLinkCode` to derive from, so the view's
        // `manager_link` disappears with it. `manager_chat_id` is kept — the
        // manager's chat does not change when the webhook is re-provisioned.
        ...(bot.credentials.manager_chat_id === undefined
          ? {}
          : { manager_chat_id: bot.credentials.manager_chat_id }),
      },
      isEnabled: true,
    });
  }

  res.json(await view(req));
};
