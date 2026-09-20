import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { probeApishipToken } from "../../../../apiship/client";
import { readApishipSecret } from "../../../../tenant-secrets/apiship";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/apiship/probe` — one read-only call to ApiShip asking whether
 * the stored token is accepted (p01-settings-integrations-restructure).
 *
 * Separate from `/tenants/apiship/key` on purpose: the key route answers from
 * our own database in a millisecond and the panel renders the form off it, so a
 * slow or dead ApiShip cannot hold the screen. The probe is its own query, and
 * while it is in flight the page says «спрашиваем ApiShip…» rather than
 * inventing a verdict (rule 19h).
 *
 * Three answers, never two (rule 20a): no token stored at all
 * (`token_set: false`), a token ApiShip rejected (`probe.ok: false` with the
 * status it answered), and a token ApiShip accepted. A transport failure is the
 * second of those with `status: null`, which is why the status is in the
 * response at all.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readApishipSecret(pg, tenant.id, { includeDisabled: true });

  if (!secret?.credentials.token) {
    res.json({ token_set: false, probe: null });
    return;
  }

  const probe = await probeApishipToken(secret.credentials.token);
  res.json({ token_set: true, probe });
};
