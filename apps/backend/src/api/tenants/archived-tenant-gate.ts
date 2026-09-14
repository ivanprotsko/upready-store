import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

const ARCHIVED_MESSAGE = "Tenant is archived";

const isArchived = (metadata: unknown): boolean =>
  Boolean(metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>)["archived_at"] === "string");

/**
 * `/tenants/*` gate (contract §4). Closes login for an archived tenant's
 * admins by MIDDLEWARE, not by touching auth identities, so `deleteTenantWorkflow`
 * stays cheap to compensate. Runs after `authenticate(TENANT_ACTOR_TYPE, …)`
 * on the same `/tenants/*` matcher in `middlewares.ts`, so `req.auth_context.actor_id`
 * is the tenant_admin id whenever it is set; `POST /tenants` (the actorless
 * registration call) has no `actor_id` and passes through untouched.
 */
export const blockArchivedTenantAdmin = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  // Typed `MedusaRequest`, not `AuthenticatedMedusaRequest`, so this stays
  // assignable to the plain `middlewares: MedusaRequestHandler[]` array in
  // `middlewares.ts`. `authenticate(TENANT_ACTOR_TYPE, …)` runs first on the
  // same `/tenants/*` matcher and is what actually puts `auth_context` on
  // the request at runtime.
  const actorId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id;

  if (!actorId) {
    next();
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.metadata"],
    filters: { id: [actorId] },
  });

  if (isArchived(tenantAdmin?.tenant?.metadata)) {
    res.status(401).json({ message: ARCHIVED_MESSAGE });
    return;
  }

  next();
};

/**
 * `POST /auth/tenant/emailpass` gate (contract §4). Looks the body's `email`
 * up in `tenant_admin`; if its tenant is archived, answers `401` before
 * Medusa's own emailpass handler runs, so an archived tenant's admin never
 * gets a working token in the first place.
 */
export const blockArchivedTenantLogin = async (
  req: MedusaRequest<{ email?: unknown }>,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const email = req.body?.email;

  if (typeof email !== "string") {
    next();
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.metadata"],
    filters: { email: [email] },
  });

  if (isArchived(tenantAdmin?.tenant?.metadata)) {
    res.status(401).json({ message: ARCHIVED_MESSAGE });
    return;
  }

  next();
};
