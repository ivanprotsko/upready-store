import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import createTenantDomainWorkflow from "../../../workflows/tenant/create-tenant-domain";
import {
  handleFromTechnicalHost,
  technicalHostsFor,
} from "../../storefront/by-host/hosts";
import type { PostTenantDomainBody } from "../validators";
import { getTenantWithDomains, respondDuplicateHost } from "./helpers";

/**
 * `GET /tenants/domains` — the hosts this tenant's storefront answers on
 * (tenant-panel wave 2, piece 9, `docs/tenant-panel/api-contract.md`).
 *
 * Two lists, and they are different kinds of thing. `domains` are rows the
 * tenant added and may delete. `technical` is derived from the handle and the
 * platform's base domains, has no row, and therefore cannot be deleted — the
 * invariant "a tenant always has a storefront host" holds by construction
 * (`docs/multitenancy/storefront-by-host.md` §2).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantWithDomains(req);

  res.json({
    domains: tenant.domains,
    technical: technicalHostsFor(tenant.handle),
  });
};

/**
 * `POST /tenants/domains` `{ host }` → `{ domain }`.
 *
 * The host is lowercased, port-stripped and shape-checked by
 * `PostTenantDomainSchema` before this runs. Two refusals, both 409:
 *
 * - the host is already a `tenant_domain` row. Whose row it is never reaches
 *   the caller: one tenant must not learn that another holds a host, the same
 *   reason a foreign id is a 404 everywhere else in this namespace.
 * - the host is `<label>.<base domain>`. That whole shape is reserved for
 *   technical subdomains, whether or not a tenant called `<label>` exists yet:
 *   a stored `foo.upready.dev` would shadow the technical host of a tenant
 *   registered as `foo` tomorrow, and the resolver checks rows first. Refusing
 *   the shape is what keeps "never deletable" true. This is stricter than the
 *   design's own wording ("not equal to ANOTHER tenant's technical host") and
 *   is listed as a deviation in the piece report.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantDomainBody>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantWithDomains(req);
  const host = req.validatedBody.host;

  const technicalLabel = handleFromTechnicalHost(host);

  if (technicalLabel) {
    respondDuplicateHost(
      res,
      technicalLabel === tenant.handle
        ? `Host "${host}" is your storefront's technical address and is always served; it cannot be added as a custom domain.`
        : `Host "${host}" is reserved: every "<handle>.<platform domain>" name belongs to the shop with that handle.`,
    );
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: existing } = await query.graph({
    entity: "tenant_domain",
    fields: ["id", "host"],
    filters: { host: [host] },
  });

  if (existing.length > 0) {
    respondDuplicateHost(res, `Host "${host}" is already in use.`);
    return;
  }

  try {
    const { result: domain } = await createTenantDomainWorkflow(req.scope).run({
      input: { host, tenant_id: tenant.id },
    });

    res.status(201).json({ domain: { id: domain.id, host: domain.host } });
  } catch (error) {
    // The read above is not a lock: two panels adding the same host in the same
    // second both pass it, and the partial unique index decides. The loser must
    // read the same 409 as the caller who lost the race by a minute, never a 500.
    if (isUniqueViolation(error)) {
      respondDuplicateHost(res, `Host "${host}" is already in use.`);
      return;
    }

    throw error;
  }
};

const isUniqueViolation = (error: unknown): boolean => {
  const text = [
    (error as { code?: string })?.code,
    (error as { message?: string })?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("23505") || text.includes("unique") || text.includes("duplicate");
};
