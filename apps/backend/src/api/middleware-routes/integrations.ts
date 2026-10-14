import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import {
  PutTenantApishipKeySchema,
  PutTenantApishipSchema,
  PostTenantApishipDocumentsSchema,
  PostTenantApishipStatusSyncSchema,
  PutTenantDeliverySettingsSchema,
  PutTenantPochtaSchema,
  PutTenantTributeSchema,
  PutTenantBtcpaySchema,
  PutTenantBitcartSchema,
  PutTenantX402Schema,
  PutTenantTelegramBotSchema,
  PutTenantPaymentSettingsSchema,
  PutTenantManualPaymentSchema,
  PutTenantPaymentPreNoticeSchema,
  PutTenantNotificationSettingsSchema,
  PutTenantRequisitesSchema,
} from "../tenants/validators";
import { PutTenantMarketplaceKeyBody } from "../tenants/marketplaces/[marketplace]/key/validators";
import { PostTenantMpCatalogLinkBody } from "../tenants/marketplaces/catalog/links/validators";
import { injectRobokassaTenant } from "../store/tenant/robokassa";
import { injectTributeTenant } from "../store/tenant/tribute";
import { injectBtcpayTenant } from "../store/tenant/btcpay";
import { injectBitcartTenant } from "../store/tenant/bitcart";
import { injectX402Tenant } from "../store/tenant/x402";
import { PostStoreX402PurchaseSchema } from "../store/x402/validators";
import { rateLimit } from "../rate-limit";
import { StoreGetPaymentProvidersParams } from "@medusajs/medusa/api/store/payment-providers/validators";
import { listTransformPaymentProvidersQueryConfig } from "@medusajs/medusa/api/store/payment-providers/query-config";

/**
 * The shop's own keys and accounts. That covers marketplace keys and catalog
 * links, the delivery and payment providers, the two webhooks that keep their
 * raw body, notification settings and requisites, and the tenant the server
 * writes into a payment session.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const integrationRoutes: MiddlewareRoute[] = [
  {
    // The owner ties one marketplace card to one variant of her shop by hand
    // (w14-mp-catalog-link). This is the answer to «требует выбора», the one
    // outcome no rule is allowed to decide.
    matcher: "/tenants/marketplaces/catalog/links",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantMpCatalogLinkBody)],
  },
  // w24-integration-keys-self-service: the shop owner stores her OWN key for
  // every marketplace. Three matchers, ONE schema and one handler family —
  // the general route plus the two per-marketplace paths this repository
  // already uses (`/tenants/wb/*`, `/tenants/ozon/*`). WHICH fields are
  // required comes from the adapter, not from a schema written per
  // marketplace (rule 20).
  {
    matcher: "/tenants/marketplaces/:marketplace/key",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
  },
  {
    matcher: "/tenants/wb/key",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
  },
  {
    matcher: "/tenants/ozon/key",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantMarketplaceKeyBody)],
  },
  {
    // p01-settings-integrations-restructure: the shop's ApiShip token. Not a
    // marketplace adapter, so it cannot ride the registry-driven matcher
    // above; it shares the slot writer instead of the schema.
    matcher: "/tenants/apiship/key",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantApishipKeySchema)],
  },
  {
    // The shop's ApiShip connection, sender, parcel defaults and carriers
    // (t-2026-10-14-58).
    matcher: "/tenants/apiship",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantApishipSchema)],
  },
  {
    // Labels and hand-over acts of the shop's ApiShip shipments (t-2026-10-14-58).
    matcher: "/tenants/apiship/documents",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantApishipDocumentsSchema)],
  },
  {
    // «Обновить статус» of the shop's ApiShip shipments (t-2026-10-14-58).
    matcher: "/tenants/apiship/status-sync",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantApishipStatusSyncSchema)],
  },
  {
    // The shop's Russian Post «Отправка» access (46df-pochta).
    matcher: "/tenants/pochta",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantPochtaSchema)],
  },
  {
    // The shop's Tribute Shop API key (t-cherk-22).
    matcher: "/tenants/tribute",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantTributeSchema)],
  },
  {
    // Tribute's per-shop webhook (t-cherk-22): `trbt-signature` is an
    // HMAC-SHA256 of the RAW body, so the exact bytes have to survive past
    // JSON parsing (`req.rawBody`) — a re-serialization of the parsed object
    // could differ in key order or whitespace and reject a genuine webhook.
    matcher: "/tribute/webhook/:tenant",
    method: ["POST"],
    bodyParser: { preserveRawBody: true },
    middlewares: [],
  },
  {
    // The shop's own Telegram bot for buyer sign-in (t-2026-10-02-telegram-auth).
    matcher: "/tenants/telegram-bot",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantTelegramBotSchema)],
  },
  {
    // The shop's payment account (t03-tenant-secrets-robokassa).
    matcher: "/tenants/payment-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantPaymentSettingsSchema)],
  },
  {
    // The shop's offline ways to pay on `pp_system_default`: crypto wallets
    // and «card via manager» (olavka-payments).
    matcher: "/tenants/payment-settings/manual",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantManualPaymentSchema)],
  },
  {
    // The shop's own BTCPay Server store (ask-20261005-070255-438f).
    matcher: "/tenants/payment-settings/btcpay",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantBtcpaySchema)],
  },
  {
    // The shop's own Bitcart store (ask-20261005-070255-438f, stage 2).
    matcher: "/tenants/payment-settings/bitcart",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantBitcartSchema)],
  },
  {
    // The shop's x402 settings (t-2026-10-03-33).
    matcher: "/tenants/payment-settings/x402",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantX402Schema)],
  },
  {
    // An AI agent's x402 purchase (t-2026-10-03-33). Each unpaid request
    // quotes on a real cart, so a client gets 30 a minute.
    matcher: "/store/x402/purchase",
    method: ["POST"],
    middlewares: [rateLimit({ limit: 30 }), validateAndTransformBody(PostStoreX402PurchaseSchema)],
  },
  {
    // BTCPay's per-shop webhook (ask-20261005-070255-438f): `BTCPay-Sig` is
    // an HMAC-SHA256 of the RAW body, so the exact bytes have to survive JSON
    // parsing (`req.rawBody`), for the reason the Tribute webhook gives above.
    matcher: "/btcpay/webhook/:tenant",
    method: ["POST"],
    bodyParser: { preserveRawBody: true },
    middlewares: [],
  },
  {
    // The pre-payment notice's per-method fields (rule 5zd, t-2026-10-03-32).
    matcher: "/tenants/payment-settings/pre-notice",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantPaymentPreNoticeSchema)],
  },
  {
    // The shop's CDEK account and the delivery kinds it offers
    // (i02-apiship-cdek-shipping).
    matcher: "/tenants/delivery-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantDeliverySettingsSchema)],
  },
  {
    // Who hears about this shop's orders (t08-order-notifications).
    matcher: "/tenants/notification-settings",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantNotificationSettingsSchema)],
  },
  {
    // The seller's legal details, resolved into this shop's `{{ТОКЕН}}`
    // placeholders (t12-legal-requisites).
    matcher: "/tenants/requisites",
    method: ["PUT"],
    middlewares: [validateAndTransformBody(PutTenantRequisitesSchema)],
  },
  {
    // Robokassa, Tribute, BTCPay, Bitcart and x402 all need the SERVER's word
    // on which shop the cart belongs to; the client's `data.tenant_id`, if
    // any, is overwritten (step 4 of the task; t-cherk-22 for Tribute;
    // ask-20261005-070255-438f for BTCPay and Bitcart; t-2026-10-03-33 for
    // x402). Each middleware is a no-op unless `body.provider_id` is its own,
    // so they compose cleanly.
    matcher: "/store/payment-collections/:id/payment-sessions",
    method: ["POST"],
    middlewares: [
      injectRobokassaTenant,
      injectTributeTenant,
      injectBtcpayTenant,
      injectBitcartTenant,
      injectX402Tenant,
    ],
  },
  {
    // The shadowing route in `src/api/store/payment-providers/route.ts`
    // reads `req.filterableFields` and `req.queryConfig` the way the core
    // route does, so it is parsed by the core's own validator and config.
    matcher: "/store/payment-providers",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(StoreGetPaymentProvidersParams, listTransformPaymentProvidersQueryConfig),
    ],
  },
];
