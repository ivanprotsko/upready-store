import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { ARCHIVED_MESSAGE, isArchived } from "./archived-tenant-gate";
import {
  decideAccess,
  permissionsOf,
  TENANT_ADMIN_ROLES,
  type TenantAdminRole,
  type TenantPermission,
} from "./permissions";

/**
 * The caller's own login row as the gate read it for THIS request. Routes that
 * need the caller's shop, role or email take it from here instead of reading
 * the row a second time.
 */
export type TenantAdminAccess = {
  id: string;
  email: string;
  tenant_id: string;
  role: TenantAdminRole;
  permissions: TenantPermission[];
};

type GatedRequest = MedusaRequest & { tenant_admin_access?: TenantAdminAccess };

const UNAUTHORIZED_MESSAGE = "Unauthorized";

const isRole = (value: unknown): value is TenantAdminRole =>
  (TENANT_ADMIN_ROLES as readonly unknown[]).includes(value);

const notAllowedMessage = (permission: TenantPermission | null) =>
  permission
    ? `Your role in this shop does not include the "${permission}" permission.`
    : "Only an owner of this shop can do this.";

/**
 * The one gate of `/tenants/*` (t-2026-10-07-11). It runs right after
 * `authenticate(TENANT_ACTOR_TYPE, …)` on the same matcher in
 * `middlewares.ts`, so `req.auth_context.actor_id` is a `tenant_admin` id,
 * and it answers three questions from ONE read of that row:
 *
 *   1. Does the login still exist? A token outlives its row for as long as it
 *      is valid, so a removed login is refused here: `401`, the same answer
 *      as no token at all.
 *   2. Is the shop archived? `401` (contract §4 of the archive: login is
 *      closed by this gate, not by touching auth identities, so
 *      `deleteTenantWorkflow` stays cheap to compensate).
 *   3. May this ROLE call this route? `permissions.ts` decides; a refusal is
 *      `403` with `{ type: "not_allowed", message, permission }`.
 *
 * The role comes from the row, never from the token: a role changed by the
 * owner is in force on the caller's next request, with no new login.
 */
export const guardTenantAdmin = async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  // Typed `MedusaRequest`, not `AuthenticatedMedusaRequest`, so this stays
  // assignable to the plain `middlewares: MedusaRequestHandler[]` array in
  // `middlewares.ts`. `authenticate(TENANT_ACTOR_TYPE, …)` runs first on the
  // same `/tenants/*` matcher and is what actually puts `auth_context` on
  // the request at runtime.
  const actorId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id;

  if (!actorId) {
    res.status(401).json({ message: UNAUTHORIZED_MESSAGE });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email", "role", "tenant.id", "tenant.metadata"],
    filters: { id: [actorId] },
  });

  if (!tenantAdmin?.tenant?.id) {
    res.status(401).json({ message: UNAUTHORIZED_MESSAGE });
    return;
  }

  if (isArchived(tenantAdmin.tenant.metadata)) {
    res.status(401).json({ message: ARCHIVED_MESSAGE });
    return;
  }

  // The column is NOT NULL with a CHECK, so anything else here is a row this
  // code does not understand: it gets the narrowest role, not the widest.
  const role: TenantAdminRole = isRole(tenantAdmin.role) ? tenantAdmin.role : "operator";

  // `req.path` is relative to the matcher the middleware is mounted on.
  const decision = decideAccess(role, req.method, req.originalUrl || req.url || "");

  if (!decision.allowed) {
    res.status(403).json({
      type: "not_allowed",
      message: notAllowedMessage(decision.permission),
      permission: decision.permission,
    });
    return;
  }

  (req as GatedRequest).tenant_admin_access = {
    id: tenantAdmin.id as string,
    email: tenantAdmin.email as string,
    tenant_id: tenantAdmin.tenant.id as string,
    role,
    permissions: permissionsOf(role),
  };

  next();
};

/** What `guardTenantAdmin` read about the caller. Every `/tenants/*` route is behind it. */
export const getTenantAdminAccess = (req: MedusaRequest): TenantAdminAccess => {
  const access = (req as GatedRequest).tenant_admin_access;

  if (!access) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "The tenant admin gate did not run for this request; the route is outside /tenants/*.",
    );
  }

  return access;
};
