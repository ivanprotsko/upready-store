import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { BTCPAY_PROVIDER_ID } from "../../../btcpay/session";
import { readBtcpaySecretPublic } from "../../../tenant-secrets/btcpay";
import { tenantOrNull } from "./robokassa";

export { BTCPAY_PROVIDER_ID };

/**
 * The only keys of the client's `data` a BTCPay session reads: where BTCPay's
 * «return to store» button leads, and the checkout language. Everything else
 * the client sends is dropped, so nothing it writes can look like a field the
 * webhook owns (`confirmed_at`, `invoice_status`…).
 */
const CLIENT_KEYS = ["return_url", "locale"] as const;

/**
 * `POST /store/payment-collections/:id/payment-sessions` for BTCPay
 * (ask-20261005-070255-438f), the counterpart of `injectTributeTenant`: the
 * shop is the SERVER's word, taken from the publishable key and checked
 * against the cart's own sales channel. A shop without an enabled BTCPay store
 * gets 404, the same answer as "provider does not exist".
 *
 * Unlike Tribute's, this one whitelists the client's keys instead of removing
 * the server's: the provider rebuilds its data from scratch anyway
 * (`initiatePayment`), so this is the second wall, not the only one.
 */
export const injectBtcpayTenant = async (
  req: MedusaStoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== BTCPAY_PROVIDER_ID) {
    return next();
  }

  const tenant = await tenantOrNull(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant
    ? await readBtcpaySecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER))
    : null;
  if (!tenant || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment provider ${BTCPAY_PROVIDER_ID} is not available for this shop.`,
    );
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

  const clientData = body.data ?? {};
  const data: Record<string, unknown> = { tenant_id: tenant.id };
  for (const key of CLIENT_KEYS) {
    if (typeof clientData[key] === "string") {
      data[key] = clientData[key];
    }
  }
  req.body = { ...body, data };
  next();
};
