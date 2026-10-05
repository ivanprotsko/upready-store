import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { cryptoPaymentsAvailable } from "../../../btcpay/availability";
import { settledX402SessionOfCollection, X402_PROVIDER_ID } from "../../../x402/session";
import { readX402SecretPublic, x402Ready } from "../../../tenant-secrets/x402";
import { backendPublicOrigin } from "../../tenants/payment-settings/helpers";
import { tenantOrNull } from "./robokassa";

export { X402_PROVIDER_ID };

/** A signed x402 payment is a few hundred bytes of base64; anything far larger is not one. */
const SIGNATURE_MAX_LENGTH = 16_384;

/**
 * `POST /store/payment-collections/:id/payment-sessions` for x402
 * (t-2026-10-03-33), the counterpart of `injectBtcpayTenant`: the shop is the
 * SERVER's word, taken from the publishable key and checked against the
 * cart's own sales channel. A shop whose x402 is not ready gets 404, the same
 * answer as "provider does not exist", and so does every shop on an instance
 * that takes no cryptocurrency (`btcpay/availability.ts`).
 *
 * The client's `data` is whitelisted down to `payment_signature`, the buyer's
 * signed payment as the `PAYMENT-SIGNATURE` header would carry it. The
 * checkout opens a session without it to read the shop's requirements, has
 * the wallet sign one, and opens a second session with it; the provider checks
 * it against requirements it builds itself, so nothing else the client sends
 * can reach the session. `resource_url` names this payment collection.
 */
export const injectX402Tenant = async (req: MedusaStoreRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== X402_PROVIDER_ID) {
    return next();
  }

  const tenant = cryptoPaymentsAvailable() ? await tenantOrNull(req) : null;
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant
    ? await readX402SecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER))
    : null;
  if (!tenant || !x402Ready(secret)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Payment provider ${X402_PROVIDER_ID} is not available for this shop.`);
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: collections } = await query.graph({
    entity: "payment_collection",
    fields: ["id", "cart.id", "cart.sales_channel_id"],
    filters: { id: req.params.id },
  });
  const cart = collections[0]?.cart as { id?: string; sales_channel_id?: string | null } | undefined;
  if (!cart?.id || cart.sales_channel_id !== tenant.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Payment collection ${req.params.id} was not found.`);
  }

  // A settled payment is never replaced: a new session would delete it, and
  // with it the record of money already sent. The checkout completes the cart.
  if (await settledX402SessionOfCollection(pg, req.params.id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This cart's x402 payment has already settled. Complete the cart to place the order.",
    );
  }

  const signature = body.data?.payment_signature;
  const data: Record<string, unknown> = {
    tenant_id: tenant.id,
    resource_url: `${backendPublicOrigin(req)}/store/payment-collections/${req.params.id}`,
    resource_description: `Order at ${tenant.name}`,
  };
  if (typeof signature === "string" && signature.length > 0 && signature.length <= SIGNATURE_MAX_LENGTH) {
    data.payment_signature = signature;
  }
  req.body = { ...body, data };
  next();
};
