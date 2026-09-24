import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils";
import type { HttpTypes } from "@medusajs/framework/types";
import { ROBOKASSA_PROVIDER_ID } from "../tenant/robokassa";
import { tenantPaymentMethodsFor } from "../tenant/payment-methods";
import { offersSystemDefault } from "../../../tenant-secrets/payment-methods";

const SYSTEM_DEFAULT_PROVIDER_ID = "pp_system_default";

/**
 * `GET /store/payment-providers` with the shop's own answer
 * (t03-tenant-secrets-robokassa, step 5; t-2026-09-24-n10 adds the demo card).
 *
 * Medusa's own route lists every enabled provider of the region. Both
 * providers this starter ships are one registration for every shop, so the
 * region says «yes» to both for all of them regardless of what any one shop
 * has actually connected; that fact lives on the tenant behind the
 * publishable key (`tenantPaymentMethodsFor`). This file shadows the core
 * route (same path, measured on the stand: the project's `src/api` is
 * mounted before the framework's own routes) and hides:
 *
 * - Robokassa, unless the shop has an enabled account;
 * - `pp_system_default`'s demo card, once the shop has connected a real
 *   method (Robokassa or a manual kind) and configured no manual kind of its
 *   own — a buyer never sees a "pay with anything" fallback next to a real
 *   payment method.
 *
 * The query parsing is the core's own (`StoreGetPaymentProvidersParams` in
 * `src/api/middlewares.ts`), so `region_id` and `fields` behave as before.
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

  const methods = await tenantPaymentMethodsFor(req);

  const withRobokassa = providers.some((provider) => provider.id === ROBOKASSA_PROVIDER_ID);
  const hideRobokassa = withRobokassa && !methods.robokassa;

  const withSystemDefault = providers.some((provider) => provider.id === SYSTEM_DEFAULT_PROVIDER_ID);
  const hideSystemDefault = withSystemDefault && !offersSystemDefault(methods);

  const visible = providers.filter((provider) => {
    if (provider.id === ROBOKASSA_PROVIDER_ID && hideRobokassa) return false;
    if (provider.id === SYSTEM_DEFAULT_PROVIDER_ID && hideSystemDefault) return false;
    return true;
  });
  const hiddenCount = (hideRobokassa ? 1 : 0) + (hideSystemDefault ? 1 : 0);

  res.json({
    payment_providers: visible,
    count: metadata.count - hiddenCount,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
