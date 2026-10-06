import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { authIdentityEntityId } from "../../../../modules/auth-telegram/lib/identity";
import { resolveBotCart } from "../../../../shop-bot/cart-adoption";
import {
  CART_OWNER_FIELDS,
  newestCartsQuery,
  type OpenCartRow,
} from "../../../../shop-bot/open-cart";
import { readUsableTelegramBot } from "../../../../tenant-secrets/telegram";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";

/**
 * `POST /store/telegram-bot/cart` with `{ initData }` answers `{ cart_id }`.
 * It is the cart this Telegram buyer filled in the chat with THIS shop's bot,
 * or null when they have none (t-cherk-23). The storefront calls it when a page
 * opens inside the shop's Mini App and puts the id into its cart cookie, so
 * «Оформить» in the bot lands on a checkout with the same cart.
 *
 * The body carries no cart id and no customer id. `initData` is the proof, the
 * shop is the one behind the publishable key, and everything else is looked up
 * (`shop-bot/cart-adoption.ts`). A forged or expired proof answers 401, a
 * session of another customer answers 403, and neither says whether a cart
 * exists.
 */

/** The same bound the Mini App sign-in uses (`medusa-config.ts`, `TELEGRAM_AUTH_MAX_AGE_SEC`). */
const maxAgeSec = (): number | undefined =>
  process.env.TELEGRAM_AUTH_MAX_AGE_SEC ? Number(process.env.TELEGRAM_AUTH_MAX_AGE_SEC) : undefined;

export const POST = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const bot = await readUsableTelegramBot(pg, tenant.id);
  if (!bot) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Telegram sign-in is not configured for this shop.",
    );
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const authModule = req.scope.resolve(Modules.AUTH);
  const body = (req.body ?? {}) as { initData?: unknown };

  const result = await resolveBotCart(
    {
      initData: typeof body.initData === "string" ? body.initData : null,
      botToken: bot.credentials.token,
      salesChannelId: tenant.sales_channel_id,
      sessionCustomerId: req.auth_context?.actor_id || null,
      verifyOptions: { maxAgeSec: maxAgeSec() },
    },
    {
      // The identity's own `app_metadata` is the link to the customer, the way
      // the bot resolves its buyer (`shop-bot/medusa-shop.ts`).
      customerIdForTelegramUser: async (telegramUserId) => {
        const [identity] = await authModule.listAuthIdentities({
          provider_identities: {
            entity_id: authIdentityEntityId(telegramUserId),
            provider: "telegram",
          },
        });
        const customerId = (identity?.app_metadata as Record<string, unknown> | undefined)
          ?.customer_id;
        return typeof customerId === "string" && customerId ? customerId : null;
      },
      listNewestCarts: async (owner) => {
        const { data } = await query.graph(newestCartsQuery(CART_OWNER_FIELDS, owner) as never);
        return data as OpenCartRow[];
      },
    },
  );

  if (!result.ok) {
    if (result.reason === "other_customer") {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "This Telegram account belongs to another customer.",
      );
    }
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      result.reason === "expired_proof"
        ? "This Telegram sign-in has expired. Try again."
        : "Telegram sign-in could not be verified.",
    );
  }

  res.json({ cart_id: result.cartId });
};
