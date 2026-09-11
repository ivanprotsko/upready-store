import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { resolveAttribution } from "./attribution";
import { handleFromTechnicalHost, normalizeHost } from "./hosts";

/**
 * `GET /storefront/by-host?host=<host>` — the one call a storefront makes before
 * it knows which shop it is serving. Tenant-panel wave 2, piece 9
 * (`t-2026-09-12-mt-storefront-by-host`, `docs/multitenancy/storefront-by-host.md`).
 *
 * Public: no auth, no publishable key. It cannot live under `/store/*`, where
 * the framework's global gate answers 400 "Publishable API key required" to any
 * call without a key — and a key is exactly what this route exists to hand out
 * (measured 2026-09-11 on the stand, design §1). The key is not a secret: every
 * storefront ships it in its own HTML.
 *
 * Resolution order (design §2):
 *   1. an exact `tenant_domain` row (custom hosts, stored lowercase, no port);
 *   2. otherwise `<handle>.<base>` for one of `TENANT_BASE_DOMAINS`, matched
 *      against `tenant.handle`;
 *   3. otherwise 404 — the storefront then falls back to single-store mode.
 *
 * Theme, composition and the home document come from `tenant_home_config`
 * (piece 8). A tenant that never saved one gets `null` in all three and the
 * storefront keeps its build-time profile: a shop with no home document is
 * still a shop, and its catalog must render.
 */

type TenantHomeDocument = {
  theme?: { preset?: string } | null;
  settings?: { defaultMode?: string } | null;
} & Record<string, unknown>;

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const host = normalizeHost(req.query.host);

  if (!host) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query parameter `host` is required.",
    );
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: domains } = await query.graph({
    entity: "tenant_domain",
    fields: ["id", "host", "tenant.id"],
    filters: { host: [host] },
  });

  let tenantId = domains[0]?.tenant?.id as string | undefined;

  if (!tenantId) {
    const handle = handleFromTechnicalHost(host);

    if (handle) {
      const { data: byHandle } = await query.graph({
        entity: "tenant",
        fields: ["id"],
        filters: { handle: [handle] },
      });

      tenantId = byHandle[0]?.id as string | undefined;
    }
  }

  if (!tenantId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No storefront is configured for host "${host}".`,
    );
  }

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "handle",
      "name",
      "metadata",
      "api_key.token",
      "home_config.config",
    ],
    filters: { id: [tenantId] },
  });

  if (!tenant?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No storefront is configured for host "${host}".`,
    );
  }

  const home = (tenant.home_config?.config ?? null) as TenantHomeDocument | null;
  const settings = home?.settings ?? null;
  const preset = home?.theme?.preset ?? null;

  res.json({
    tenant: {
      id: tenant.id,
      handle: tenant.handle,
      name: tenant.name,
    },
    // Null only for a tenant whose key was deleted through the Admin: one key
    // per tenant is `createTenantWorkflow`'s invariant, not a database
    // constraint (`src/links/tenant-api-key.ts`). The storefront treats a null
    // the way it treats a 404 — single-store fallback — rather than calling the
    // Store API with the string "null".
    publishable_key: (tenant.api_key?.token as string | undefined) ?? null,
    theme: preset ? { preset, mode: settings?.defaultMode ?? null } : null,
    // The footer's attribution line, resolved shop → group → platform default
    // (`attribution.ts`). Always present: a shop that configures nothing still
    // gets the platform's own anchor, so the footer is never blank.
    attribution: resolveAttribution(
      (tenant.metadata ?? null) as Record<string, unknown> | null,
    ),
    settings,
    home,
  });
};
