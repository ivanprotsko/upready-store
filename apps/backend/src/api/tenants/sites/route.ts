import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { probeCertificate } from "../../../tenant-sites/certificate";
import cloneTenantWorkflow from "../../../workflows/tenant/clone-tenant";
import { primaryHostFor, technicalHostsFor } from "../../storefront/by-host/hosts";
import { getTenantScope, listGroupSites } from "../tenant-scope";
import type { PostTenantSiteBody } from "../validators";

type SiteRow = {
  id: string;
  name: string;
  handle: string;
  domains?: ({ host?: string; is_primary?: boolean } | null)[] | null;
};

/**
 * `GET /tenants/sites` (t-2026-09-24-n12, «Настройки → Сайты»): every site of
 * the caller's client, the current one first. A shop without a group gets a
 * list of one, itself. For each site: its handle, its technical address (the
 * wildcard certificate covers it), its own domains with a live certificate
 * check (`tenant-sites/certificate.ts`), and the address it is found at.
 *
 * The list comes from `listGroupSites`, which reads the group off the caller's
 * own row, so it can never show another client's sites.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { sites } = await listGroupSites(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "handle", "domains.host", "domains.is_primary"],
    filters: { id: sites.map((site) => site.tenant_id) },
  });
  const byId = new Map((data as SiteRow[]).map((row) => [row.id, row]));
  const currentId = sites[0]?.tenant_id;

  const result = await Promise.all(
    sites
      .map((site) => byId.get(site.tenant_id))
      .filter((row): row is SiteRow => Boolean(row))
      .map(async (row) => {
        const domains = (row.domains ?? []).filter(
          (domain): domain is { host: string; is_primary?: boolean } => Boolean(domain?.host),
        );
        const primaryDomain = domains.find((domain) => domain.is_primary)?.host ?? null;
        return {
          id: row.id,
          name: row.name,
          handle: row.handle,
          is_current: row.id === currentId,
          primary_host: primaryHostFor({ handle: row.handle, primaryDomain }),
          technical_hosts: technicalHostsFor(row.handle),
          domains: await Promise.all(
            domains.map(async (domain) => ({
              host: domain.host,
              is_primary: Boolean(domain.is_primary),
              certificate: await probeCertificate(domain.host),
            })),
          ),
        };
      }),
  );

  res.json({ sites: result });
};

/**
 * `POST /tenants/sites` `{ name, handle, copy_pages?, copy_shipping? }` →
 * `201 { site }`: «Создать сайт», a copy of the caller's CURRENT site
 * through `cloneTenantWorkflow`. The source is never a body field and the new
 * site's admin is always the caller (same email and name), so this cannot be
 * turned into a copy of someone else's shop or a shop for someone else. The
 * caller's login keeps opening the site it opens today; the new one appears
 * in the switcher (`GET /tenants/me/shops`).
 */
export const POST = async (req: AuthenticatedMedusaRequest<PostTenantSiteBody>, res: MedusaResponse) => {
  const source = await getTenantScope(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [caller],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email", "first_name", "last_name"],
    filters: { id: [req.auth_context.actor_id] },
  });

  if (!caller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant admin ${req.auth_context.actor_id} was not found.`);
  }

  const body = req.validatedBody;
  const { result } = await cloneTenantWorkflow(req.scope).run({
    input: {
      source_tenant_id: source.id,
      name: body.name,
      handle: body.handle,
      admin: {
        email: caller.email as string,
        first_name: (caller.first_name as string | null) ?? null,
        last_name: (caller.last_name as string | null) ?? null,
      },
      copy_pages: body.copy_pages,
      copy_shipping: body.copy_shipping,
    },
  });

  res.status(201).json({
    site: {
      id: result.tenant.id,
      name: result.tenant.name,
      handle: result.tenant.handle,
      primary_host: primaryHostFor({ handle: result.tenant.handle as string }),
    },
  });
};
