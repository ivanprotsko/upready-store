import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { readTributeSecretPublic } from "../../../tenant-secrets/tribute";
import { tributeAvailable } from "../../../tribute/availability";
import { tenantOrNull } from "./robokassa";

export const TRIBUTE_PROVIDER_ID = "pp_tribute_tribute";

/** Whether the shop behind the request has an enabled Tribute account. Same shape as `robokassaAvailableFor`. */
export const tributeAvailableFor = async (req: MedusaStoreRequest): Promise<boolean> => {
  const tenant = await tenantOrNull(req);
  if (!tenant) {
    return false;
  }
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  return Boolean(await readTributeSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER)));
};

/**
 * `POST /store/payment-collections/:id/payment-sessions` for Tribute
 * (t-cherk-22), the exact counterpart of `injectRobokassaTenant`: the shop's
 * credentials are resolved from `data.tenant_id`, which must be the SERVER's
 * word, taken from the publishable key and checked against the cart's own
 * sales channel — never the client's. A shop without an enabled Tribute
 * account gets 404, the same answer as "provider does not exist", so a second
 * tenant cannot probe whether the first one configured Tribute. Every shop on
 * an instance that does not offer Tribute (`tribute/availability.ts`) gets the
 * same 404, its saved key or not.
 */
export const injectTributeTenant = async (
  req: MedusaStoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== TRIBUTE_PROVIDER_ID) {
    return next();
  }

  const tenant = tributeAvailable() ? await tenantOrNull(req) : null;
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant
    ? await readTributeSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER))
    : null;
  if (!tenant || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment provider ${TRIBUTE_PROVIDER_ID} is not available for this shop.`,
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

  const { tenant_id: _tenant, confirmed_at: _confirmed, last_event: _event, last_failure_at: _failure, ...clientData } =
    body.data ?? {};
  req.body = { ...body, data: { ...clientData, tenant_id: tenant.id } };
  next();
};
