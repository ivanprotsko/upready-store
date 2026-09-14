import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  buildSeedPlan,
  resolveAbstractDataset,
  resolveMediaBaseUrl,
} from "../../../migration-scripts/data/abstract-datasets";
import seedTenantDatasetWorkflow from "../../../workflows/tenant/seed-tenant-dataset";
import { getTenantScope, listTenantCategoryIds, listTenantProductIds } from "../tenant-scope";
import type { PostTenantSeedBodyType } from "./validators";

/**
 * `POST /tenants/seed` — the starter catalog for a shop that has nothing yet
 * (specs/catalog-taxonomy/ABSTRACT-DATASETS.md §4). Called by the onboarding wizard right after
 * the owner's first login; usable again from the panel later by the same rule.
 *
 * Idempotent by construction: a shop that already owns a product or a category is left exactly
 * as it is and told so (200, `seeded: false`), because the starter set is for an EMPTY shop and
 * a second copy next to the owner's own goods would be a mess nobody asked for.
 *
 * The dataset is resolved from the theme preset the shop chose; today every preset resolves to
 * the one universal set `abstract` (Ivan, 2026-09-12). A missing media base URL or a missing
 * dataset is a 500 with the sentence that names what is unset — never an empty shop that
 * reads as "seeded".
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantSeedBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);

  if (!tenant.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Tenant ${tenant.id} has no sales channel to sell in.`);
  }

  const [productIds, categoryIds] = await Promise.all([listTenantProductIds(req), listTenantCategoryIds(req)]);

  if (productIds.length || categoryIds.length) {
    res.status(200).json({
      seeded: false,
      reason: `the shop already has ${productIds.length} product(s) and ${categoryIds.length} category(ies); the starter catalog is only for an empty shop`,
      products: productIds.length,
      categories: categoryIds.length,
      dataset: null,
      heroImageUrl: null,
    });
    return;
  }

  const preset = req.validatedBody?.preset ?? "geist";
  const dataset = resolveAbstractDataset(preset);
  const mediaBase = resolveMediaBaseUrl();
  const plan = buildSeedPlan(dataset, { tenantHandle: tenant.handle, mediaBase });

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [shippingProfile],
  } = await query.graph({ entity: "shipping_profile", fields: ["id"] });

  if (!shippingProfile?.id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "No shipping profile exists, so no product can be created. Run the backend seed once (pnpm backend:seed).",
    );
  }

  const { result } = await seedTenantDatasetWorkflow(req.scope).run({
    input: {
      tenant_id: tenant.id,
      sales_channel_id: tenant.sales_channel_id,
      shipping_profile_id: shippingProfile.id as string,
      plan,
    },
  });

  res.status(201).json({
    seeded: true,
    dataset: dataset.id,
    products: result.product_ids.length,
    categories: result.category_ids.length,
    collections: result.collection_ids.length,
    heroImageUrl: plan.heroImageUrl,
  });
};
