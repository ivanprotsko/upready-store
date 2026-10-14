import { type MiddlewareRoute, authenticate } from "@medusajs/framework/http";
import { attachOrderAccessToken, ensureCartTenantScope } from "../store/cart-scope";
import {
  ensureOrderAccess,
  ensureReturnOrderAccess,
  guardOrderTransferRequest,
  scopeOrderListToShop,
} from "../store/order-access";
import { guardSyntheticTelegramEmail } from "../store/customers/synthetic-email-guard";
import { resolveTelegramTenant } from "../auth/telegram-tenant";
import { injectCustomerTenantMetadata } from "../store/customers/inject-tenant-metadata";
import { stripCustomerTenantMetadata } from "../store/customers/strip-tenant-metadata";

/**
 * Buyer accounts and Store API isolation. That covers claiming guest orders,
 * the shop a customer signed up in, Yandex ID and Telegram sign-in, and the
 * order and cart access checks.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const storeAccessRoutes: MiddlewareRoute[] = [
  // ---- f03-guest-order-not-in-account: the buyer takes over the orders
  // this shop holds under their own address. It carries no body, so there is
  // nothing to validate; what it needs is a customer behind the call, and
  // the shop, which the framework's publishable-key gate has already put on
  // the request by the time the route runs.
  {
    matcher: "/store/customers/me/claim-orders",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },

  // ---- t-2026-10-02-shop-aware-account-emails: this is the one request
  // that ever learns which shop a buyer signed up in (no customer↔tenant
  // link exists). The publishable key behind it is written into
  // `metadata.tenant_id`, for `customer-created.ts`'s welcome letter to read.
  {
    matcher: "/store/customers",
    method: ["POST"],
    middlewares: [injectCustomerTenantMetadata],
  },
  // The lead's security review of the same task: `metadata.tenant_id` now
  // decides where a password-reset link points
  // (`password-reset-email.ts` reads it off the CUSTOMER row, never off the
  // request), so the buyer's own "update my profile" call must not be able
  // to set it to a shop they do not belong to.
  {
    matcher: "/store/customers/me",
    method: ["POST"],
    middlewares: [stripCustomerTenantMetadata],
  },

  // ---- w02-yandex-id-auth: the buyer who already has an account signs in
  // with Yandex ID for the first time. The token this runs with is the one
  // the OAuth callback issued, and it carries NO customer yet
  // (`actor_id` empty), which is exactly what `allowUnregistered` admits —
  // the same setting Medusa's own `POST /store/customers` uses for the
  // registration leg of email-and-password signup.
  {
    matcher: "/store/customers/oauth-link",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["bearer"], { allowUnregistered: true }),
    ],
  },

  // ---- t-2026-10-02-telegram-auth. `/me/telegram-link`: a buyer already
  // signed in by e-mail attaches Telegram as a second way in. The synthetic
  // `tg_<id>@telegram.local` address is reserved for the Telegram identity
  // with that id, on both legs that could otherwise claim it first.
  {
    matcher: "/store/customers/me/telegram-link",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  // t-cherk-23. The cart a buyer filled in the shop's bot. The proof is the
  // Mini App's `initData` in the body, so a call with no session is let
  // through. A session is read only to refuse another customer's.
  {
    matcher: "/store/telegram-bot/cart",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
    ],
  },
  {
    matcher: "/store/customers",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"], { allowUnregistered: true }),
      guardSyntheticTelegramEmail,
    ],
  },
  {
    matcher: "/auth/customer/emailpass/register",
    method: ["POST"],
    middlewares: [guardSyntheticTelegramEmail],
  },
  {
    matcher: "/auth/customer/telegram",
    method: ["GET", "POST"],
    middlewares: [resolveTelegramTenant],
  },

  // ---- b07-store-api-isolation: the Store API stops handing one shop's
  // orders to another shop's key, and one buyer's order to anybody holding
  // its id. The checks live next to the data they guard
  // (`store/order-access.ts`, `store/cart-scope.ts`); what is registered
  // here is where each one runs.
  //
  // They are middlewares rather than routes of our own because the core
  // handlers are a few lines each around a core-flows workflow, and a
  // project middleware runs AFTER the framework's own for the same path, so
  // `req.queryConfig`, `req.filterableFields` and `req.validatedBody` are
  // all populated by the time they see the request.
  //
  // `GET /store/orders/:id` carries NO authenticate in core, so
  // `req.auth_context` was never populated and the route could not tell an
  // owner from a stranger even if it wanted to. `allowUnauthenticated` is
  // what keeps the guest confirmation page reachable: an anonymous call is
  // let through to `ensureOrderAccess`, which then demands the order's
  // access token.
  {
    matcher: "/store/orders/:id",
    method: ["GET"],
    middlewares: [
      authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
      ensureOrderAccess,
    ],
  },
  {
    matcher: "/store/orders",
    method: ["GET"],
    middlewares: [scopeOrderListToShop],
  },
  {
    matcher: "/store/orders/:id/transfer/request",
    method: ["POST"],
    middlewares: [guardOrderTransferRequest],
  },
  // `POST /store/returns` takes an `order_id` out of the body and completes
  // a return against it, with no authentication in core at all.
  {
    matcher: "/store/returns",
    method: ["POST"],
    middlewares: [
      authenticate("customer", ["session", "bearer"]),
      ensureReturnOrderAccess,
    ],
  },
  // Every `/store/carts/:id…` route, read and write: the cart has to belong
  // to the shop whose publishable key the call carries.
  {
    matcher: "/store/carts/*",
    method: "ALL",
    middlewares: [ensureCartTenantScope],
  },
  // The one place the guest access token is handed out.
  {
    matcher: "/store/carts/:id/complete",
    method: ["POST"],
    middlewares: [attachOrderAccessToken],
  },
];
