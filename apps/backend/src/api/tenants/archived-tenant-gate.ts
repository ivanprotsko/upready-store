import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { TENANT_ACTOR_TYPE } from "../../modules/tenant";

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
 * `POST /auth/tenant/emailpass` gate (contract §4). Checks the ONE tenant the
 * login is actually about to open, not "any `tenant_admin` row this email
 * happens to have": since o25-platform-admin-all-shops, one email
 * (`PLATFORM_ADMIN_EMAIL` chief among them) can hold a row in several
 * tenants, and Medusa's own login resolves the actor from the auth
 * identity's `app_metadata.tenant_id` (`generateJwtTokenForAuthIdentity`,
 * `@medusajs/medusa/api/auth/utils/generate-jwt-token.js`) — the same field
 * this reads. Answers `401` before Medusa's own emailpass handler runs, so
 * an archived tenant's admin never gets a working token for THAT shop.
 *
 * An identity with no `app_metadata.tenant_id` yet (freshly registered,
 * never logged in) has nothing to gate on and passes through; Medusa's own
 * handler answers `NOT_FOUND` for it regardless.
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

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  const [identity] = await authModuleService.listAuthIdentities({
    provider_identities: { entity_id: email, provider: "emailpass" },
  });

  const tenantAdminId = identity?.app_metadata?.[`${TENANT_ACTOR_TYPE}_id`] as string | undefined;

  if (!tenantAdminId) {
    next();
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.metadata"],
    filters: { id: [tenantAdminId] },
  });

  if (isArchived(tenantAdmin?.tenant?.metadata)) {
    res.status(401).json({ message: ARCHIVED_MESSAGE });
    return;
  }

  next();
};
