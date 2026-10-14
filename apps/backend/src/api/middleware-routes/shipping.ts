import {
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import {
  GetShippingRegionsSchema,
  PostStoreShippingQuoteSchema,
  PostTenantShippingMethodSchema,
  PostTenantShippingMethodsReorderSchema,
  PostTenantShippingMethodUpdateSchema,
  PostTenantShippingSettingsSchema,
  PostTenantZonePresetsSchema,
} from "../tenants/shipping-methods/validators";
// ---- t-2026-10-03-32 (rule 5zd): the pre-payment notice's charge estimate.
import { PostStoreChargeEstimateSchema } from "../store/payment-settings/charge-estimate/validators";

/**
 * The shop's delivery methods and the checkout's reads of them, and the pre-
 * payment notice's charge estimate.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const shippingRoutes: MiddlewareRoute[] = [
  // ---- t04-shipping-tariffs (day-2026-09-16): the shop's own delivery
  // methods (/tenants/shipping-methods/**, behind the "/tenants/*"
  // authenticate in `gates.ts`) and the checkout's quote/regions reads
  // (/store/shipping-methods/**, behind the framework's publishable-key gate).
  // The static segments (settings, reorder, regions) are matched before the
  // ":id" routes by Medusa's router, so they never read as an id.
  {
    matcher: "/tenants/shipping-methods",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantShippingMethodSchema)],
  },
  {
    matcher: "/tenants/shipping-methods/reorder",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantShippingMethodsReorderSchema)],
  },
  {
    matcher: "/tenants/shipping-methods/settings",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantShippingSettingsSchema)],
  },
  {
    matcher: "/tenants/shipping-methods/regions",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(GetShippingRegionsSchema, {})],
  },
  {
    // b03-shipping-zones-weight: one method per Russian zone in a single call.
    matcher: "/tenants/shipping-methods/zone-presets",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantZonePresetsSchema)],
  },
  {
    matcher: "/tenants/shipping-methods/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostTenantShippingMethodUpdateSchema)],
  },
  {
    matcher: "/store/shipping-methods/quote",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostStoreShippingQuoteSchema)],
  },
  {
    matcher: "/store/shipping-methods/regions",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(GetShippingRegionsSchema, {})],
  },
  {
    // The pre-payment notice's «≈ amount» (rule 5zd, t-2026-10-03-32).
    matcher: "/store/payment-settings/charge-estimate",
    method: ["POST"],
    middlewares: [validateAndTransformBody(PostStoreChargeEstimateSchema)],
  },
];
