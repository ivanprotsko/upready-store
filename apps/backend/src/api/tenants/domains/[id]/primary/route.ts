import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { getTenantWithDomains } from "../../helpers";

/**
 * `POST /tenants/domains/:id/primary` — make a custom domain the shop's MAIN
 * address: the one `canonical`, `hreflang`, `sitemap`, `robots`, `JSON-LD` and
 * `og:url` name, and the one every other address of the shop redirects to
 * (`specs/tenant-address/CANONICAL.md` §1.1).
 *
 * The domain is checked before it is promoted. A `canonical` pointing at a host
 * that does not serve the shop is the exact defect this task was opened for: all
 * five storefronts named `stores.shipshift.dev`, which answers 302 into a 404.
 * A host whose DNS the owner has not pointed at us yet would be the same bug with
 * a different spelling, so adding a domain claims it and this call confirms it.
 */

/** How long we wait for the domain to answer before calling it unreachable. */
const PROBE_TIMEOUT_MS = 5000;

export const reachesOurStorefront = async (
  host: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    // /healthz is the one path that answers without a tenant and is excluded
    // from the storefront's middleware, so it is not redirected and does not
    // need the shop to be resolvable yet (`apps/storefront/src/app/healthz`).
    const response = await fetchImpl(`https://${host}/healthz`, {
      signal: controller.signal,
      redirect: "manual",
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { status?: string };

    return body?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantWithDomains(req);
  const domainId = req.params.id;
  const domain = tenant.domains.find((candidate) => candidate.id === domainId);

  if (!domain) {
    // A domain of another shop reads as "not found", the same as everywhere else
    // in this namespace: one tenant never learns what another holds.
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Domain ${domainId} was not found.`,
    );
  }

  if (!(await reachesOurStorefront(domain.host))) {
    res.status(409).json({
      code: "invalid_request_error",
      type: "not_reachable",
      message: `"${domain.host}" does not answer as your shop yet. Point its CNAME at us, wait for DNS to spread, and try again.`,
    });
    return;
  }

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  // Every other domain of this shop steps down first: "one main address" is a
  // partial unique index in the database, so promoting before demoting would be
  // refused by it rather than silently leaving two.
  const demoted = tenant.domains
    .filter((candidate) => candidate.is_primary && candidate.id !== domain.id)
    .map((candidate) => ({ id: candidate.id, is_primary: false }));

  if (demoted.length > 0) {
    await tenantModuleService.updateTenantDomains(demoted);
  }

  await tenantModuleService.updateTenantDomains({
    id: domain.id,
    is_primary: true,
  });

  res.json({ domain: { id: domain.id, host: domain.host, is_primary: true } });
};

/**
 * `DELETE /tenants/domains/:id/primary` — go back to the platform subdomain as
 * the main address. The custom domain keeps answering; it just stops being the
 * one search is pointed at.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantWithDomains(req);
  const domain = tenant.domains.find((candidate) => candidate.id === req.params.id);

  if (!domain) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Domain ${req.params.id} was not found.`,
    );
  }

  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  await tenantModuleService.updateTenantDomains({
    id: domain.id,
    is_primary: false,
  });

  res.json({ domain: { id: domain.id, host: domain.host, is_primary: false } });
};
