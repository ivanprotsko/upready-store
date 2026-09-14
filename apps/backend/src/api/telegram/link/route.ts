import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { isLinkCode, isUsable } from "../../../tenant-notifications/link-code";
import {
  defaultOwnerLocale,
  ownerText,
  resolveOwnerLocale,
} from "../../../tenant-notifications/owner-messages";

/**
 * `POST /telegram/link` — the bot redeems a one-time code
 * (t08-order-notifications).
 *
 * Who calls it: the `@upreadystore_bot` process (`apps/bot`), and nobody else.
 * It is the only side that sees a `/start` payload, and this backend is the
 * only side that knows which shop minted the code, so the two have to talk. The
 * call is authenticated by a shared secret header rather than a session,
 * because the bot is a service and has no user.
 *
 * It lives outside `/tenants/*` on purpose: that namespace requires a tenant
 * actor token, which the bot does not and must not have. The pattern is
 * `/robokassa/result`'s — a public path whose authority is a signature, not a
 * login.
 *
 * The reply TEXT is built here and returned ready to print. The bot then has no
 * copy of the owner's wording to drift from, and a shop's name never has to
 * travel through a second template.
 */

const SECRET_HEADER = "x-telegram-link-secret";

type LinkBody = {
  code?: unknown;
  chat_id?: unknown;
  chat_title?: unknown;
  language_code?: unknown;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const POST = async (req: MedusaRequest<LinkBody>, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const expected = (process.env.TELEGRAM_LINK_SECRET ?? "").trim();

  if (expected === "") {
    // Fail closed. An unset secret would otherwise make this route an open door
    // to every shop's notifications.
    logger.error(
      "[telegram-link] TELEGRAM_LINK_SECRET is not set; refusing every link attempt. Set it on the backend AND on the bot.",
    );
    res.status(503).json({ status: "unconfigured" });
    return;
  }

  if (asText(req.headers[SECRET_HEADER]) !== expected) {
    logger.warn("[telegram-link] A link attempt arrived with a wrong or missing secret.");
    res.status(401).json({ status: "unauthorized" });
    return;
  }

  const code = asText(req.body?.code);
  const chatId = asText(req.body?.chat_id);
  const chatTitle = asText(req.body?.chat_title);
  const locale = resolveOwnerLocale(asText(req.body?.language_code), defaultOwnerLocale());

  if (!isLinkCode(code) || chatId === "") {
    res.status(400).json({
      status: "unknown",
      message: ownerText(locale, "linkUnknown"),
    });
    return;
  }

  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);
  const [row] = (await tenantModule.listTenantNotificationSettings({ link_code: code })) as Array<{
    id: string;
    tenant_id: string;
    link_code: string | null;
    link_code_expires_at: Date | null;
  }>;

  if (!row) {
    logger.info("[telegram-link] A code that belongs to no shop was presented.");
    res.status(404).json({ status: "unknown", message: ownerText(locale, "linkUnknown") });
    return;
  }

  if (!isUsable(row, new Date())) {
    logger.info(`[telegram-link] An expired code of tenant ${row.tenant_id} was presented.`);
    res.status(410).json({ status: "expired", message: ownerText(locale, "linkExpired") });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name"],
    filters: { id: row.tenant_id },
  });
  const shopName = ((tenants[0] as { name?: string } | undefined)?.name ?? "").trim();

  await tenantModule.updateTenantNotificationSettings({
    id: row.id,
    telegram_chat_id: chatId,
    telegram_chat_title: chatTitle || null,
    telegram_linked_at: new Date(),
    // Single use: the code dies the moment it works.
    link_code: null,
    link_code_expires_at: null,
  });

  logger.info(
    `[telegram-link] Tenant ${row.tenant_id} is now linked to Telegram chat ${chatId}.`,
  );

  res.json({
    status: "linked",
    shop_name: shopName,
    message: [
      ownerText(locale, "linked", { shop: shopName }),
      ownerText(locale, "linkedHint"),
    ].join("\n"),
  });
};
