import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { readRobokassaSecret } from "../../../tenant-secrets/robokassa";
import { resolveTenantFromPublishableKey, type StoreTenant } from "./resolve-tenant";

export const ROBOKASSA_PROVIDER_ID = "pp_robokassa_robokassa";

/**
 * The shop behind the request's publishable key, or `null` when the key is
 * the platform's single-store one (no tenant link). Robokassa is a per-shop
 * account, so a keyless or tenantless request simply does not have it.
 * Exported for `tenant/payment-methods.ts`, which resolves the same tenant
 * for the wider "which methods are connected" question.
 */
export const tenantOrNull = async (req: MedusaStoreRequest): Promise<StoreTenant | null> => {
  try {
    return await resolveTenantFromPublishableKey(req);
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return null;
    }
    throw error;
  }
};

/** Whether the shop behind the request has an enabled Robokassa account. */
export const robokassaAvailableFor = async (req: MedusaStoreRequest): Promise<boolean> => {
  const tenant = await tenantOrNull(req);
  if (!tenant) {
    return false;
  }
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  return Boolean(await readRobokassaSecret(pg, tenant.id));
};

/**
 * `POST /store/payment-collections/:id/payment-sessions` for Robokassa
 * (t03-tenant-secrets-robokassa, step 4).
 *
 * The provider resolves the shop's credentials from `data.tenant_id`, and that
 * id must be the SERVER's word, never the client's: it is taken from the
 * publishable key, checked against the cart the payment collection belongs
 * to, and written over whatever the body carried. Any other client key that
 * the provider treats as server-owned (`result_*`) is dropped here as well;
 * the provider rebuilds its data from scratch anyway (`initiatePayment`),
 * so this is the second wall, not the only one.
 *
 * A shop without an enabled account gets 404 on the provider, the same answer
 * as for a provider that does not exist, so a second tenant cannot probe
 * whether the first one configured Robokassa.
 */
export const injectRobokassaTenant = async (
  req: MedusaStoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== ROBOKASSA_PROVIDER_ID) {
    return next();
  }

  const tenant = await tenantOrNull(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant ? await readRobokassaSecret(pg, tenant.id) : null;
  if (!tenant || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment provider ${ROBOKASSA_PROVIDER_ID} is not available for this shop.`,
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

  const { tenant_id: _tenant, result_confirmed_at: _confirmed, result_out_sum: _sum, ...clientData } =
    body.data ?? {};
  req.body = { ...body, data: { ...clientData, tenant_id: tenant.id } };
  next();
};
