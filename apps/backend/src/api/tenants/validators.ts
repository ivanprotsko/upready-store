/**
 * The body and query schemas of the `/tenants/*` routes. They live in
 * `validators/`, one file per area (t-2026-10-14-55), and this file re-exports
 * all of them, so `middleware-routes/` and the routes keep importing from here.
 */
export * from "./validators/account";
export * from "./validators/content";
export * from "./validators/storefront";
export {
  PutTenantPaymentSettingsSchema,
  PutTenantManualPaymentSchema,
  PutTenantPaymentPreNoticeSchema,
  PutTenantTributeSchema,
  PutTenantBtcpaySchema,
  PutTenantBitcartSchema,
  PutTenantX402Schema,
} from "./validators/payments";
export type {
  PutTenantPaymentSettingsBody,
  PutTenantManualPaymentBody,
  PutTenantPaymentPreNoticeBody,
  PutTenantTributeBody,
  PutTenantBtcpayBody,
  PutTenantBitcartBody,
  PutTenantX402Body,
} from "./validators/payments";
export * from "./validators/settings";
