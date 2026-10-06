import { verifyInitData, type VerifyOptions } from "../modules/auth-telegram/lib/verify";
import { pickOwnedOpenCart, type CartOwner, type OpenCartRow } from "./open-cart";

/**
 * Which cart the storefront may open for a buyer who entered the shop's Mini
 * App (t-cherk-23). It is the cart they filled in the chat with the bot.
 *
 * The request names no cart. A cart id in a link or in a request body would be
 * a credential anybody could copy, so the only input is the proof that
 * Telegram gave this launch. That proof is `Telegram.WebApp.initData`, signed
 * with this shop's own bot token and fresh, the same check the Mini App
 * sign-in runs (`modules/auth-telegram/lib/verify.ts`). The cart is then
 * looked up from what the proof says, never from what the caller asks for:
 *
 *   proof -> Telegram user -> the customer of that Telegram identity
 *         -> that customer's newest open cart in the shop of the request.
 *
 * A session of another customer is refused, so a signed-in buyer never ends up
 * holding a cart their account does not own.
 */

export type CartAdoptionRefusal = "bad_proof" | "expired_proof" | "other_customer";

export type CartAdoptionResult =
  | { ok: true; cartId: string | null }
  | { ok: false; reason: CartAdoptionRefusal };

export type CartAdoptionInput = {
  initData: string | null | undefined;
  /** The bot token of the shop of the request, resolved by the caller. */
  botToken: string;
  /** The sales channel of the shop of the request. */
  salesChannelId: string;
  /** The customer of the caller's session, when it has one. */
  sessionCustomerId: string | null;
  verifyOptions?: VerifyOptions;
};

export type CartAdoptionPorts = {
  /** The customer linked to the Telegram identity, or null when there is none yet. */
  customerIdForTelegramUser: (telegramUserId: number) => Promise<string | null>;
  /** This owner's carts, newest first (`newestCartsQuery`). */
  listNewestCarts: (owner: CartOwner) => Promise<OpenCartRow[]>;
};

export const resolveBotCart = async (
  input: CartAdoptionInput,
  ports: CartAdoptionPorts,
): Promise<CartAdoptionResult> => {
  const verdict = verifyInitData(input.initData, input.botToken, input.verifyOptions);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason === "expired" ? "expired_proof" : "bad_proof" };
  }

  const customerId = await ports.customerIdForTelegramUser(verdict.user.id);
  if (!customerId) {
    // A Telegram user who never wrote to the bot has no cart there.
    return { ok: true, cartId: null };
  }

  if (input.sessionCustomerId && input.sessionCustomerId !== customerId) {
    return { ok: false, reason: "other_customer" };
  }

  const owner = { customerId, salesChannelId: input.salesChannelId };
  const cart = pickOwnedOpenCart(await ports.listNewestCarts(owner), owner);
  return { ok: true, cartId: cart?.id ?? null };
};
