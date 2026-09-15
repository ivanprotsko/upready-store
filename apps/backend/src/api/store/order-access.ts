import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { guestOrderTokenMatches } from "../../store-order-access/token";

/**
 * Who may read an order through the Store API (b07-store-api-isolation).
 *
 * Medusa's own `GET /store/orders/:id` carries no authentication at all — its
 * source file says so in a comment ("TODO: Do we want to apply some sort of
 * authentication here? My suggestion is that we do",
 * `@medusajs/medusa/dist/api/store/orders/[id]/route.js`). On a single-store
 * install that is a deliberate trade for the guest confirmation page. On this
 * multi-tenant deployment it meant anyone holding ANY shop's publishable key
 * could read ANY order of ANY shop, with the buyer's email, phone and
 * shipping address in the response (measured 2026-09-15 on the b07 stand:
 * `GET /store/orders/<acme order>` with cherkashino's key → 200).
 *
 * The rules this module enforces, in order:
 *
 *   1. The order has to belong to a sales channel the request's publishable
 *      key names. A shop's key never reaches another shop's order.
 *   2. A logged-in customer may read their own order (`order.customer_id`).
 *   3. Anyone else needs the order's own access token, which is the guest
 *      mechanism: it rides the confirmation link the storefront redirects to
 *      after checkout and the link in the "order placed" email, and nothing
 *      else hands it out. A guest has no account to authenticate with, so
 *      without it the "Thank you" page would 404 for the very buyer who just
 *      paid.
 *
 * The token itself lives in `src/store-order-access/token.ts`, because the
 * order-placed email mints the same value for the link it carries.
 *
 * Every refusal is the SAME answer, `404 Not Found`, and never `401`: on a
 * route addressed by id, a 401 for an existing order and a 404 for a
 * non-existent one is itself an oracle — it confirms that this id exists in
 * this shop, which is half of what the caller was after. `GET /store/orders`
 * answers the same way by returning an empty list rather than an error.
 */

/**
 * The order id out of the request. `req.params` is populated for a matcher
 * with a path parameter, and the URL is the fallback that holds whatever
 * express mounted the middleware under.
 */
export const orderIdFromRequest = (req: MedusaStoreRequest): string => {
  const fromParams = (req.params as Record<string, string> | undefined)?.id;
  if (fromParams) {
    return fromParams;
  }
  return /^\/store\/orders\/([^/?#]+)/.exec(req.originalUrl)?.[1] ?? "";
};

/**
 * The token as the storefront sends it: the `x-order-token` header.
 *
 * A query parameter would have been the obvious place, and it is not
 * available: `validateAndTransformQuery(StoreGetOrderParams, …)` is strict and
 * answered `400 … Unrecognized fields: 'token'` on the stand before the header
 * replaced it. The browser URL still carries `?token=`, because the
 * confirmation link has to survive a copy-paste and an email client; the
 * storefront reads it there and forwards it as this header.
 */
export const orderTokenFromRequest = (req: MedusaStoreRequest): string | undefined => {
  const fromHeader = req.headers["x-order-token"];
  return typeof fromHeader === "string" ? fromHeader : undefined;
};

export type AccessibleOrder = {
  id: string;
  customer_id: string | null;
  sales_channel_id: string | null;
};

const notFound = (orderId: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id: ${orderId} was not found`);

/**
 * The sales channels the request's publishable key is bound to. The framework
 * puts them on every `/store/*` request (`ensurePublishableApiKeyMiddleware`),
 * and on this deployment one channel is one shop (`store/tenant/resolve-tenant.ts`).
 */
export const requestSalesChannelIds = (req: MedusaStoreRequest): string[] =>
  req.publishable_key_context?.sales_channel_ids ?? [];

/**
 * Loads the order and refuses it unless the caller is allowed to read it.
 * Throws `MedusaError.Types.NOT_FOUND` (→ HTTP 404) in every other case.
 */
export const assertOrderAccess = async (
  req: MedusaStoreRequest,
  orderId: string,
): Promise<AccessibleOrder> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "sales_channel_id"],
    filters: { id: orderId },
  });

  if (!order?.id) {
    throw notFound(orderId);
  }

  const channelIds = requestSalesChannelIds(req);
  if (channelIds.length) {
    // An order with no channel cannot be shown to be THIS shop's, so it is
    // refused rather than waved through: a fail-open here is the whole defect
    // this module exists to close.
    if (!order.sales_channel_id || !channelIds.includes(order.sales_channel_id as string)) {
      throw notFound(orderId);
    }
  }

  const customerId = (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id;
  if (customerId && order.customer_id === customerId) {
    return order as AccessibleOrder;
  }

  if (guestOrderTokenMatches(orderId, orderTokenFromRequest(req))) {
    return order as AccessibleOrder;
  }

  throw notFound(orderId);
};

/**
 * `GET /store/orders/:id` — the gate itself.
 *
 * It is a middleware and not a route of our own, deliberately: the core
 * handler is three lines around `getOrderDetailWorkflow`, and shadowing it
 * would mean owning every future change to it (and pulling
 * `@medusajs/core-flows` in as a direct dependency, which this app does not
 * have). Project middlewares run AFTER the framework's own for the same path —
 * measured on the b07 stand, where core's body validator answered before this
 * file's `authenticate` did — so `req.queryConfig` and `req.auth_context` are
 * both populated by the time this runs, and a throw here stops the handler.
 */
export const ensureOrderAccess = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const storeReq = req as unknown as MedusaStoreRequest;
  try {
    await assertOrderAccess(storeReq, orderIdFromRequest(storeReq));
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * `GET /store/orders` — the list is narrowed to the shop whose publishable key
 * the call carries.
 *
 * The core handler builds its filters as `{ ...req.filterableFields, customer_id }`,
 * so writing the channel list onto `req.filterableFields` is enough, and doing
 * it here (after the query validator, before the handler) is what stops a
 * caller from widening it with their own `sales_channel_id`.
 *
 * Before this: one account is one customer row across every shop on the
 * deployment, and a buyer who had ordered in two shops saw both lists under
 * either key (measured 2026-09-15 on the b07 stand — cherkashino's key
 * answered with the acme order in it).
 */
export const scopeOrderListToShop = (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const channelIds = requestSalesChannelIds(req as unknown as MedusaStoreRequest);
  if (channelIds.length) {
    const request = req as unknown as { filterableFields?: Record<string, unknown> };
    request.filterableFields = {
      ...(request.filterableFields ?? {}),
      sales_channel_id: channelIds,
    };
  }
  next();
};

/**
 * `POST /store/orders/:id/transfer/request` — the second door into the same
 * data (rule 20: the class, not the place).
 *
 * The core route answers the requester with the FULL order detail, whatever
 * `fields` they ask for, and its workflow refuses only an order the requester
 * already owns. Measured on the b07 stand before this change: a logged-in
 * stranger sent the id of somebody else's guest order and got back `email`,
 * `shipping_address.phone` and the line items.
 *
 * Two things change, and the transfer flow itself is untouched: the order has
 * to belong to this shop, and the answer carries `id` and `email` only — which
 * is what the storefront form renders ("we sent a confirmation to …") and
 * nothing more.
 */
export const guardOrderTransferRequest = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const storeReq = req as unknown as MedusaStoreRequest;
  try {
    const orderId = orderIdFromRequest(storeReq);
    const channelIds = requestSalesChannelIds(storeReq);

    if (channelIds.length) {
      const query = storeReq.scope.resolve(ContainerRegistrationKeys.QUERY);
      const {
        data: [order],
      } = await query.graph({
        entity: "order",
        fields: ["id", "sales_channel_id"],
        filters: { id: orderId },
      });
      if (
        !order?.id ||
        !order.sales_channel_id ||
        !channelIds.includes(order.sales_channel_id as string)
      ) {
        throw notFound(orderId);
      }
    }

    const queryConfig = (req as unknown as { queryConfig?: { fields: string[] } }).queryConfig;
    if (queryConfig) {
      queryConfig.fields = ["id", "email"];
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * `POST /store/returns` — the write-side face of the same class.
 *
 * The core route takes an `order_id` out of an unauthenticated body and
 * creates and completes a return against it. Measured on the b07 stand before
 * this change: an anonymous call carrying somebody else's order id reached the
 * body validator (`400 … Field 'return_shipping' is required`), so nothing but
 * the shape of the payload stood between a stranger and a return on another
 * buyer's order. The route now carries `authenticate("customer", …)` in
 * `src/api/middlewares.ts`, and this adds the ownership half.
 */
export const ensureReturnOrderAccess = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  try {
    const body = (req as unknown as { validatedBody?: { order_id?: string } }).validatedBody;
    const orderId = body?.order_id;
    if (!orderId) {
      // No order named: the core validator owns that answer, not this gate.
      return next();
    }
    await assertOrderAccess(req as unknown as MedusaStoreRequest, orderId);
    next();
  } catch (error) {
    next(error);
  }
};
