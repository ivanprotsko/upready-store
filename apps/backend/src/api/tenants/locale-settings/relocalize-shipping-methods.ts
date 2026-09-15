import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { relocalizeDefaultShippingMethods as relocalizeDefaultShippingMethodsForZones } from "../../../shipping-tariffs/relocalize-default-methods";
import { getTenantWarehouse } from "../shipping-methods/helpers";

/**
 * Request-scoped wrapper of `shipping-tariffs/relocalize-default-methods.ts`
 * for `PUT /tenants/locale-settings` (t06-locale-currency): resolves the
 * tenant behind the token's own warehouse zones, then relocalizes its
 * still-default shipping methods to `locale`.
 *
 * A shop with no warehouse yet (provisioning never ran, or is mid-flight) is
 * left alone — the locale save must not fail over shipping plumbing that will
 * exist by the time the owner reaches /shipping. Returns how many options
 * were relocalized, for the caller to log.
 */
export const relocalizeDefaultShippingMethods = async (
  req: AuthenticatedMedusaRequest,
  locale: string,
): Promise<number> => {
  let warehouse;
  try {
    warehouse = await getTenantWarehouse(req);
  } catch {
    return 0;
  }

  return relocalizeDefaultShippingMethodsForZones(req.scope, warehouse.service_zone_ids, locale);
};
