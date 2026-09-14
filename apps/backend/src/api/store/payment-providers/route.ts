import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { HttpTypes } from "@medusajs/framework/types";
import { ROBOKASSA_PROVIDER_ID, robokassaAvailableFor } from "../tenant/robokassa";

/**
 * `GET /store/payment-providers` with the shop's own answer
 * (t03-tenant-secrets-robokassa, step 5).
 *
 * Medusa's own route lists every enabled provider of the region. Robokassa is
 * one registration for every shop, so the region says «yes» for all of them;
 * whether THIS shop can take money through it is a fact about the tenant
 * behind the publishable key. This file shadows the core route (same path,
 * measured on the stand: the project's `src/api` is mounted before the
 * framework's own routes) and hides Robokassa unless the shop has an enabled
 * account. The query parsing is the core's own (`StoreGetPaymentProvidersParams`
 * in `src/api/middlewares.ts`), so `region_id` and `fields` behave as before.
 */
export const GET = async (
  req: MedusaStoreRequest<HttpTypes.StorePaymentProviderFilters>,
  res: MedusaResponse<HttpTypes.StorePaymentProviderListResponse>,
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: providers, metadata } = await query.graph({
    entity: "payment_provider",
    filters: { ...req.filterableFields, is_enabled: true },
    fields: req.queryConfig?.fields?.length ? req.queryConfig.fields : ["id"],
    pagination: req.queryConfig?.pagination,
  });

  const withRobokassa = providers.some((provider) => provider.id === ROBOKASSA_PROVIDER_ID);
  const hide = withRobokassa && !(await robokassaAvailableFor(req));
  const visible = hide ? providers.filter((provider) => provider.id !== ROBOKASSA_PROVIDER_ID) : providers;

  res.json({
    payment_providers: visible as HttpTypes.StorePaymentProvider[],
    count: hide ? (metadata?.count ?? visible.length) - 1 : (metadata?.count ?? visible.length),
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? visible.length,
  });
};
