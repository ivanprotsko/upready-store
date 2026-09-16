import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import { tenantVariants } from "../../../../../modules/marketplace/project";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import { getTenantScope } from "../../../tenant-scope";
import type { PostTenantMpCatalogLinkBodyType } from "./validators";

/**
 * `POST /tenants/marketplaces/catalog/links` — the manual link
 * (w14-mp-catalog-link, spec 2.4).
 *
 * This is the answer to «требует выбора»: two products of the shop carry the
 * same article, no rule may choose between them, and the owner does. The row
 * is written with `matched_by = 'manual'`, which is what protects it from the
 * next import — `planLinkWrites` never rewrites a manual row.
 *
 * Both halves are checked against THIS shop before anything is written: the
 * card has to be a `mp_product` of this tenant, and the variant has to be a
 * variant of a product this tenant owns. Neither is taken on the client's
 * word, because a link is the one place where an id from a body could quietly
 * tie a stranger's product to this shop's card.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const body = req.validatedBody as PostTenantMpCatalogLinkBodyType;
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  const scope = {
    tenant_id: tenant.id,
    marketplace: body.marketplace,
    external_id: body.external_id,
  };

  const [card] = (await mp.listMpProducts(scope)) as Record<string, unknown>[];
  if (!card) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Карточки ${body.marketplace}/${body.external_id} у этого магазина нет (mp_product).`,
    );
  }

  const variants = await tenantVariants({ container: req.scope, tenantId: tenant.id });
  const variant = variants.find((candidate) => candidate.id === body.variant_id);
  if (!variant) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Вариант ${body.variant_id} не принадлежит этому магазину.`,
    );
  }

  const existing = ((await mp.listMpLinks(scope)) as Record<string, unknown>[])[0];
  const linkedAt = new Date();

  const draft = {
    tenant_id: tenant.id,
    marketplace: body.marketplace,
    external_id: body.external_id,
    product_id: variant.product_id,
    variant_id: variant.id,
    matched_by: "manual",
    confidence: 1,
    linked_at: linkedAt,
  };

  const link = existing
    ? await mp.updateMpLinks([{ ...draft, id: String(existing.id) }])
    : await mp.createMpLinks([draft]);

  res.status(existing ? 200 : 201).json({
    link: Array.isArray(link) ? link[0] : link,
    replaced: existing ? String(existing.matched_by) : null,
  });
};
