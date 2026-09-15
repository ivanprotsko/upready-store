import crypto from "node:crypto";

/**
 * The order access token (b07-store-api-isolation).
 *
 * A guest buyer has no account, so nothing about them can be authenticated.
 * What they do have is the link: the confirmation page the checkout redirects
 * to, and the "your order is placed" email. This token is what makes that link
 * a credential instead of a plain id, and it is the only way past
 * `assertOrderAccess` for somebody who is not the order's logged-in owner
 * (`api/store/order-access.ts`).
 *
 * It is an HMAC of the order's id, so nothing is stored and the email template
 * can compute the same value hours after the checkout wrote the redirect. It
 * does not expire, exactly like the link that carries it: whoever holds the
 * link holds the order, which is the trade every "order status" link makes.
 *
 * This module lives outside `api/` on purpose — both the API routes and the
 * email template read it, and `api/` is the Medusa route tree, not a place to
 * import from.
 */

/** sha256, base64url — the length is public and only used to reject junk early. */
const TOKEN_LENGTH = 43;

const accessSecret = (): string =>
  process.env.ORDER_ACCESS_SECRET || process.env.JWT_SECRET || "supersecret";

export const guestOrderToken = (orderId: string): string =>
  crypto
    .createHmac("sha256", accessSecret())
    .update(`store-order-access:${orderId}`)
    .digest("base64url");

export const guestOrderTokenMatches = (orderId: string, provided: unknown): boolean => {
  if (typeof provided !== "string" || provided.length !== TOKEN_LENGTH) {
    // Checked first because `timingSafeEqual` throws on a length mismatch.
    return false;
  }
  const expected = Buffer.from(guestOrderToken(orderId));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
