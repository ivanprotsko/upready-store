import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { probePochta } from "../../../../pochta/client";
import { pochtaApiCredentials, readPochtaSecret } from "../../../../tenant-secrets/pochta";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/pochta/probe` — «Проверить подключение» (46df-pochta).
 *
 * Read-only: the delivery-point directory with the token, and one contract
 * tariff when a user key is stored. Separate from `/tenants/pochta` for the
 * reason the ApiShip probe gives: the form renders from our own database and
 * must not wait on the carrier.
 *
 * Three answers per credential, never two: not stored, rejected (with the
 * status the carrier answered, `null` when it did not answer at all), accepted.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readPochtaSecret(pg, tenant.id, { includeDisabled: true });
  const credentials = pochtaApiCredentials(secret);

  if (!secret || !credentials) {
    res.json({ token_set: false, user_key_set: false, probe: null });
    return;
  }

  const probe = await probePochta(credentials, { from_index: secret.credentials.sender_index || undefined });
  res.json({ token_set: true, user_key_set: Boolean(credentials.user_key), probe });
};
