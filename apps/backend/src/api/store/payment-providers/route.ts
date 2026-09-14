import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils";
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
  if (!req.filterableFields.region_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You must provide the region_id to list payment providers",
    );
  }

  // The same read the core route makes (`@medusajs/medusa` dist/api/store/payment-providers/route.js):
  // the region ↔ provider link, one row per provider offered in the region.
  const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
  const { rows, metadata } = await remoteQuery(
    remoteQueryObjectFromString({
      entryPoint: "region_payment_provider",
      variables: {
        filters: { region_id: req.filterableFields.region_id },
        ...req.queryConfig.pagination,
      },
      fields: req.queryConfig.fields.map((field) => `payment_provider.${field}`),
    }),
  );
  const providers = (rows as Array<{ payment_provider: HttpTypes.StorePaymentProvider }>).map(
    (relation) => relation.payment_provider,
  );

  const withRobokassa = providers.some((provider) => provider.id === ROBOKASSA_PROVIDER_ID);
  const hide = withRobokassa && !(await robokassaAvailableFor(req));
  const visible = hide ? providers.filter((provider) => provider.id !== ROBOKASSA_PROVIDER_ID) : providers;

  res.json({
    payment_providers: visible,
    count: hide ? metadata.count - 1 : metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
