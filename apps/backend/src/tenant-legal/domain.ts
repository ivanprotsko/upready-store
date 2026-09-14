import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { normalizeHost, primaryHostFor } from "../api/storefront/by-host/hosts";

/**
 * The value of `{{ДОМЕН_САЙТА}}` (t12-legal-requisites): the tenant's own
 * primary address, read the same way `canonical`/`sitemap`/`og:url` already
 * are (`GET /storefront/by-host`), never a value typed into a form — a typed
 * copy could drift from the host the shop actually answers on the moment a
 * custom domain is added or dropped.
 */
export const resolveTenantDomain = async (
  container: MedusaContainer,
  tenant: { id: string; handle: string },
  requestHost?: string | null,
): Promise<string> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "domains.host", "domains.is_primary"],
    filters: { id: tenant.id },
  });

  const row = data[0] as { domains?: { host?: string; is_primary?: boolean }[] } | undefined;
  const primaryDomain = row?.domains?.find((domain) => domain?.is_primary && domain.host)?.host ?? null;

  return primaryHostFor({
    handle: tenant.handle,
    primaryDomain,
    requestHost: normalizeHost(requestHost),
  });
};
