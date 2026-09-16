import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MARKETPLACES } from "../../../modules/marketplace/registry";
import { getTenantScope } from "../tenant-scope";
import { buildCard } from "./status-payload";

/**
 * `GET /tenants/marketplaces` — every marketplace this shop can connect, and
 * the state of each (w12-marketplace-core).
 *
 * The list comes from `modules/marketplace/registry.ts` and from nowhere else,
 * so a third adapter appears on this screen by being registered. That is the
 * whole point of the core: before it, `/tenants/wb/status` and
 * `/tenants/ozon/status` were two routes and two panel pages, and the third
 * marketplace would have needed both written again (rule 20).
 *
 * The keys are NEVER in the response. This route also does not ASK the keys
 * what they may do: on Ozon that is a network request per card, and a list
 * screen would spend one on every render. The per-marketplace route does ask,
 * which is why the card opens with «не спрошено» and fills in when the owner
 * opens it.
 *
 * Authentication is the namespace's own: `/tenants/*` is behind
 * `authenticate("tenant", …)` in `src/api/middlewares.ts`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);

  const marketplaces = await Promise.all(
    MARKETPLACES.map((adapter) => buildCard(req.scope, adapter, tenant.id)),
  );

  res.json({ marketplaces, count: marketplaces.length });
};
