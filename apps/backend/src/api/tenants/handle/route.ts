import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import changeTenantHandleWorkflow from "../../../workflows/tenant/change-tenant-handle";
import { assertHandleAvailable } from "../../../workflows/tenant/shared/assert-handle-available";
import { baseDomains, primaryHostFor } from "../../storefront/by-host/hosts";
import { getTenantWithDomains, respondDuplicateHost } from "../domains/helpers";
import type { PostTenantHandleBody } from "../validators";

/**
 * `POST /tenants/handle` `{ handle }` — the shop owner changes the address their
 * storefront answers on (`t-2026-09-12-tenant-address-canonical`,
 * `specs/tenant-address/CANONICAL.md` §1.2).
 *
 * What the owner is buying, and what the panel warns about before this is called:
 * the new address answers at once (the wildcard certificate already covers it),
 * the old one keeps answering and redirects page for page, and the old handle
 * stays reserved for this shop for good. What it costs is time in search —
 * weeks of re-indexing, not days — which is why the confirmation screen says so.
 *
 * Two refusals, both 409 with a sentence rather than a code: the address belongs
 * to another shop, or it belonged to one before and stays reserved for it.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantHandleBody>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantWithDomains(req);
  const handle = req.validatedBody.handle;

  if (handle === tenant.handle) {
    res.status(409).json({
      code: "invalid_request_error",
      type: "duplicate_error",
      message: `"${handle}" is already this shop's address.`,
    });
    return;
  }

  try {
    await assertHandleAvailable(req.scope, handle, { exceptTenantId: tenant.id });
  } catch (error) {
    if (
      error instanceof MedusaError &&
      error.type === MedusaError.Types.DUPLICATE_ERROR
    ) {
      respondDuplicateHost(res, error.message);
      return;
    }

    throw error;
  }

  await changeTenantHandleWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, handle },
  });

  const base = baseDomains()[0];

  res.json({
    handle,
    // The main address after the change, so the panel can show the shop's new
    // URL without rebuilding it from parts of its own.
    primary_host: primaryHostFor({
      handle,
      primaryDomain: tenant.domains.find((domain) => domain.is_primary)?.host ?? null,
    }),
    previous_host: `${tenant.handle}.${base}`,
  });
};
