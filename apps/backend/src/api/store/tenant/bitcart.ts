import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { BITCART_PROVIDER_ID } from "../../../bitcart/session";
import { cryptoPaymentsAvailable } from "../../../btcpay/availability";
import { readBitcartSecretPublic } from "../../../tenant-secrets/bitcart";
import { tenantOrNull } from "./robokassa";

export { BITCART_PROVIDER_ID };

/**
 * The only key of the client's `data` a Bitcart session reads: where the
 * checkout page's «return to store» leads. Everything else the client sends
 * is dropped, so nothing it writes can look like a field the server's
 * readings own (`confirmed_at`, `invoice_status`…).
 */
const CLIENT_KEYS = ["return_url"] as const;

/**
 * `POST /store/payment-collections/:id/payment-sessions` for Bitcart
 * (ask-20261005-070255-438f, stage 2), the counterpart of `injectBtcpayTenant`:
 * the shop is the SERVER's word, taken from the publishable key and checked
 * against the cart's own sales channel. A shop without an enabled Bitcart
 * store gets 404, the same answer as "provider does not exist", and so does
 * every shop on an instance that takes no cryptocurrency
 * (`btcpay/availability.ts`, the switch both crypto providers obey).
 */
export const injectBitcartTenant = async (
  req: MedusaStoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== BITCART_PROVIDER_ID) {
    return next();
  }

  const tenant = cryptoPaymentsAvailable() ? await tenantOrNull(req) : null;
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant
    ? await readBitcartSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER))
    : null;
  if (!tenant || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment provider ${BITCART_PROVIDER_ID} is not available for this shop.`,
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
