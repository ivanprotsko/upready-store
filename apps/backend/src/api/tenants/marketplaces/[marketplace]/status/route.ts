import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_IDS, adapterFor } from "../../../../../modules/marketplace/registry";
import { getTenantScope } from "../../../tenant-scope";
import { buildCard } from "../../status-payload";

/**
 * `GET /tenants/marketplaces/:marketplace/status` — one marketplace card, with
 * the key's own answer about what it may do (w12-marketplace-core).
 *
 * This is the route that ASKS. On Ozon that is a real `POST /v1/roles` and it
 * is journalled like any other read; on Wildberries the key carries its own
 * scope and nothing leaves the process. Either way the answer is `true`,
 * `false` or `"unknown"`, and `read_only_source` says how it was decided —
 * never `true` because somebody remembers a bit number (rule 17a).
 *
 * `GET /tenants/wb/status` keeps answering with its own body for one more
 * wave; it is not touched by this task.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const id = String(req.params.marketplace ?? "");
  const adapter = adapterFor(id);

  if (!adapter) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Маркетплейс ${id} не подключён. Есть: ${MARKETPLACE_IDS.join(", ")}.`,
    );
  }

  res.json(await buildCard(req.scope, adapter, tenant.id, { withCredentials: true }));
};
