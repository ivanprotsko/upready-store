import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace";
import type MarketplaceModuleService from "../../../../../../modules/marketplace/service";
import { getTenantScope } from "../../../../tenant-scope";

/**
 * `DELETE /tenants/marketplaces/catalog/links/:id` — unlink one card
 * (w14-mp-catalog-link).
 *
 * The row is soft-deleted, so «эта карточка была связана вот с этим товаром»
 * stays answerable afterwards. The card returns to «требует выбора» or to «не
 * найдено в магазине» on the next load, depending on what the matcher says
 * about it now — the screen re-derives that, it is not stored.
 *
 * The id is checked against this tenant before the delete. An id in a URL is
 * the client's word, and `mp_link` holds every shop's links in one table.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const id = String(req.params.id);

  const [link] = (await mp.listMpLinks({ id, tenant_id: tenant.id })) as Record<string, unknown>[];
  if (!link) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Связи ${id} у этого магазина нет.`);
  }

  await mp.softDeleteMpLinks([id]);

  res.json({ id, object: "mp_link", deleted: true, matched_by: String(link.matched_by) });
};
