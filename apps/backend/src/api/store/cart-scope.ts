import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { requestSalesChannelIds } from "./order-access";
import { guestOrderToken } from "../../store-order-access/token";

/**
 * Cart isolation between shops (b07-store-api-isolation).
 *
 * A cart holds the buyer's email, phone and shipping address, and every core
 * `/store/carts/:id*` route is addressed by that id with no authentication —
 * it cannot have any, because a guest checkout has nobody to authenticate.
 * What it CAN have is the shop: measured 2026-09-15 on the b07 stand,
 * `GET /store/carts/<acme cart>` answered 200 with the buyer's email when the
 * call carried cherkashino's publishable key. That much is closed here.
 *
 * What is NOT closed, and cannot be without breaking guest checkout: inside
 * one shop the cart id is still the only credential. It lives in an httpOnly
 * cookie and is never printed, so the residual exposure is "whoever has the
 * id", the same trade Medusa makes upstream.
 */
export const ensureCartTenantScope = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const storeReq = req as unknown as MedusaStoreRequest;
  try {
    // `req.path` is relative to the mount point of a wildcard matcher, so the
    // id is read off the full URL instead, which is the same string whatever
    // express mounted this under.
    const cartId = /^\/store\/carts\/([^/?#]+)/.exec(storeReq.originalUrl)?.[1];
    const channelIds = requestSalesChannelIds(storeReq);

    if (!cartId || !channelIds.length) {
      return next();
    }

    const query = storeReq.scope.resolve(ContainerRegistrationKeys.QUERY);
    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "sales_channel_id"],
      filters: { id: cartId },
    });

    if (!cart?.id) {
      // A cart that does not exist is the core's own 404 to give, with its own
      // wording. Nothing is decided here.
      return next();
    }

    if (!cart.sales_channel_id || !channelIds.includes(cart.sales_channel_id as string)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart with id: ${cartId} was not found`);
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * `POST /store/carts/:id/complete` answers with the order that was just
 * placed. This adds `order_token` next to it — the capability the buyer needs
 * to open the confirmation page while they have no account to authenticate
 * with (`store/order-access.ts`). The storefront puts it in the redirect URL
 * and the "order placed" email carries the same value, so the guest reaches
 * the page from either side.
 *
 * It wraps `res.json` rather than shadowing the completion route, because that
 * route is a payment-critical piece of core and copying it here would mean
 * owning every future change to it.
 */
export const attachOrderAccessToken = async (
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const original = res.json.bind(res);

  (res as { json: (body: unknown) => MedusaResponse }).json = (body: unknown) => {
    const payload = body as { type?: string; order?: { id?: string } } | null;
    if (payload?.type === "order" && payload.order?.id) {
      return original({ ...payload, order_token: guestOrderToken(payload.order.id) } as never);
    }
    return original(body as never);
  };

  next();
};
