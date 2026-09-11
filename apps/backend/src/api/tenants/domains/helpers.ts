import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * Tenant-panel wave 2, piece 9. The caller's own tenant with its handle and its
 * stored custom hosts, read in ONE `query.graph` off `tenant_admin` — the same
 * shape `tenant-scope.ts` uses for products and categories, because that is the
 * proven relation path on this stand and there is no tenant admin id on a
 * `tenant_domain` row to filter by.
 *
 * The handle is what the technical host is derived from, so it has to come out
 * of the same read: `getTenantScope` in `tenant-scope.ts` does not carry it,
 * and widening that shared file would touch another piece's lines.
 */

export type TenantWithDomains = {
  id: string;
  handle: string;
  name: string;
  domains: { id: string; host: string; is_primary: boolean }[];
  /** Handles this shop used to answer on, kept for the 301s and reserved for good. */
  aliases: string[];
};

export const getTenantWithDomains = async (
  req: AuthenticatedMedusaRequest,
): Promise<TenantWithDomains> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: [
      "id",
      "tenant.id",
      "tenant.handle",
      "tenant.name",
      "tenant.domains.id",
      "tenant.domains.host",
      "tenant.domains.is_primary",
      "tenant.handle_aliases.handle",
    ],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  const tenant = tenantAdmin?.tenant;

  if (!tenant?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  return {
    id: tenant.id as string,
    handle: tenant.handle as string,
    name: tenant.name as string,
    // Mapped first, narrowed second: `tenant.domains` is typed from the
    // module's own generated `TenantDomain` (timestamps, `tenant_id`, the
    // relation), so a type predicate straight to `{ id, host }` is not
    // assignable to it — `tsc` says so once `.medusa/types` has been generated
    // by a build or a dev run, and says nothing before that.
    domains: (tenant.domains ?? [])
      .map((domain) => ({
        id: domain?.id,
        host: domain?.host,
        is_primary: Boolean(domain?.is_primary),
      }))
      .filter((domain): domain is { id: string; host: string; is_primary: boolean } =>
        Boolean(domain.id && domain.host),
      ),
    aliases: (tenant.handle_aliases ?? [])
      .map((alias) => alias?.handle)
      .filter((handle): handle is string => Boolean(handle))
      .sort(),
  };
};

/**
 * 409 in the body shape Medusa's own error handler produces, written straight
 * onto the response instead of thrown.
 *
 * Measured in `@medusajs/framework/dist/http/middlewares/error-handler.js`
 * (2.19.0): `MedusaError.Types.DUPLICATE_ERROR` answers **422**, and
 * `MedusaError.Types.CONFLICT` answers 409 but REPLACES the message with a
 * generic idempotency-key sentence. The contract asks for a 409 whose type is
 * `duplicate_error` and whose message says which host is taken
 * (`docs/tenant-panel/api-contract.md`, "Piece 9"), which no throwable
 * MedusaError produces — so the route answers it itself.
 */
export const respondDuplicateHost = (
  res: { status: (code: number) => { json: (body: unknown) => void } },
  message: string,
) => {
  res.status(409).json({
    code: "invalid_request_error",
    type: "duplicate_error",
    message,
  });
};
