import type { MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { listDeliveryPoints, type PochtaCredentials } from "../../../pochta/client";
import { fromDeliveryPoint, isBuyerPoint, type PochtaStorePoint } from "../../../pochta/method";
import { pochtaApiCredentials, readPochtaSecretPublic, type ResolvedPochtaSecret } from "../../../tenant-secrets/pochta";
import { resolveTenantFromPublishableKey, type StoreTenant } from "../tenant/resolve-tenant";

/**
 * The shop behind a store request and its Russian Post access (46df-pochta).
 * The shop comes from the publishable key, never from the query: the points
 * are fetched with the shop's OWN token, and a `tenant_id` a client could type
 * would let one shop spend another's quota.
 */
export const pochtaContext = async (
  req: MedusaStoreRequest,
): Promise<{ tenant: StoreTenant; secret: ResolvedPochtaSecret | null; credentials: PochtaCredentials | null }> => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readPochtaSecretPublic(pg, tenant.id, req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER));
  return { tenant, secret, credentials: pochtaApiCredentials(secret) };
};

/** The buyer points of the directory, in the storefront's shape. Cached by the client for six hours. */
export const buyerPoints = async (credentials: PochtaCredentials): Promise<PochtaStorePoint[]> =>
  (await listDeliveryPoints(credentials)).filter(isBuyerPoint).map(fromDeliveryPoint);

/**
 * Logs why a buyer-facing Russian Post read failed and returns the flag the
 * route answers with instead (t-2026-09-30-01). The carrier's text, a status
 * code or our own configuration message is for the shop's owner and for us,
 * never for the buyer's browser: the storefront only needs to know the carrier
 * is unavailable right now.
 */
export const pochtaUnavailable = (
  req: MedusaStoreRequest,
  route: string,
  tenantId: string,
  error: unknown,
): { unavailable: true } => {
  const detail = error instanceof Error ? error.message : String(error);
  req.scope
    .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
    .warn(`[pochta] ${route} failed for tenant ${tenantId}: ${detail}`);
  return { unavailable: true };
};
