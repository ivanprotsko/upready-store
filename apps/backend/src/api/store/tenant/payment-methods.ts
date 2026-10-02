import type { MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { readRobokassaSecretPublic } from "../../../tenant-secrets/robokassa";
import {
  manualPaymentMethods,
  resolveTenantPaymentMethods,
  type TenantPaymentMethods,
} from "../../../tenant-secrets/payment-methods";
import { legacyManualPayment, readManualPayment } from "../../tenants/payment-settings/manual/manual-payment";
import { tenantOrNull } from "./robokassa";

/**
 * Which payment methods the shop behind this request's publishable key has
 * connected: Robokassa (`tenant_integration_secret`) and the manual
 * provider's two offline kinds (`tenant.metadata.manual_payment`). Shared by
 * `GET /store/payment-providers` (the checkout's own filter) and by
 * `GET /storefront/by-host` (the public document every page reads).
 *
 * A keyless or tenantless request (the platform's own key, a single-store
 * install) has connected nothing of its own: `resolveTenantPaymentMethods`
 * then answers with the demo card alone, exactly today's single-store
 * behaviour.
 */
export const tenantPaymentMethodsFor = async (req: MedusaStoreRequest): Promise<TenantPaymentMethods> => {
  const tenant = await tenantOrNull(req);

  if (!tenant) {
    return resolveTenantPaymentMethods({ robokassaEnabled: false, manualCrypto: false, manualManager: false });
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const [secret, tenantResult] = await Promise.all([
    readRobokassaSecretPublic(pg, tenant.id, logger),
    query.graph({ entity: "tenant", fields: ["metadata"], filters: { id: [tenant.id] } }),
  ]);

  const metadata = (tenantResult.data[0]?.metadata ?? null) as Record<string, unknown> | null;
  const manualPayment = readManualPayment(metadata);

  return resolveTenantPaymentMethods({
    robokassaEnabled: Boolean(secret),
    ...manualPaymentMethods(legacyManualPayment(manualPayment)),
  });
};
