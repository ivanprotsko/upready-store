import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, MedusaError } from "@medusajs/framework/utils";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import type { TenantAdminRole } from "../api/tenants/permissions";
import type { ChangesetOp } from "./ops";

/** An op, or the read that goes with it. */
export type LoopbackRequest = ChangesetOp | { method: "GET"; path: string; body?: undefined };

/**
 * How a changeset op runs: as an HTTP request to this same backend, under a
 * token of the caller's own login on the target site (decision recorded with
 * `decide.mjs`, t-2026-10-27-04).
 *
 * The request goes through everything the panel's own request goes through:
 * the field guard, the tenant session, the role gate, the body validator, the
 * route and its workflows. Nothing here writes a row of the shop itself, so
 * nothing here can skip a check those layers make.
 */

/** Who asks: the caller's login row on the main site, and the login behind it. */
export type Caller = {
  admin_id: string;
  email: string;
  role: TenantAdminRole;
  tenant_id: string;
  auth_identity_id: string;
};

export type OpAnswer = { status: number; body: Record<string, unknown> };

/** Where the backend listens, seen from itself. `AGENT_CHANGESET_API_URL` overrides it. */
export const loopbackBase = (): string =>
  (process.env.AGENT_CHANGESET_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "9000"}`).replace(/\/+$/, "");

/** Short: one changeset action, then it is useless. */
const TOKEN_LIFETIME = "5m";

/**
 * The caller's login row on `tenantId`. On the main site it is the caller's
 * own row. On the stage site it is found by the same email, or made with the
 * same role the first time, the way `POST /tenants/me/switch` makes a row on
 * a sister site, and marked `metadata.via_stage`.
 */
export const loginRowOn = async (
  container: MedusaContainer,
  caller: Caller,
  tenantId: string,
): Promise<string> => {
  if (tenantId === caller.tenant_id) {
    return caller.admin_id;
  }

  const service: TenantModuleService = container.resolve(TENANT_MODULE);
  const [row] = await service.listTenantAdmins({ email: caller.email, tenant_id: tenantId });
  if (row) {
    return row.id;
  }

  const [own] = await service.listTenantAdmins({ id: caller.admin_id });
  const created = await service.createTenantAdmins({
    email: caller.email,
    first_name: own?.first_name ?? undefined,
    last_name: own?.last_name ?? undefined,
    role: caller.role,
    tenant_id: tenantId,
    metadata: { via_stage: caller.tenant_id },
  });
  return created.id;
};

const tokenFor = (container: MedusaContainer, caller: Caller, adminId: string): string => {
  const configModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const { http } = configModule.projectConfig;

  return generateJwtToken(
    {
      actor_id: adminId,
      actor_type: TENANT_ACTOR_TYPE,
      auth_identity_id: caller.auth_identity_id,
      auth_provider: "emailpass",
      app_metadata: { [`${TENANT_ACTOR_TYPE}_id`]: adminId },
      user_metadata: {},
    },
    { secret: http.jwtSecret as string, expiresIn: TOKEN_LIFETIME, jwtOptions: http.jwtOptions },
  );
};

/** One request as the caller on `tenantId`. Never throws for a refusal: the status says it. */
export const callAs = async (
  container: MedusaContainer,
  caller: Caller,
  tenantId: string,
  op: LoopbackRequest,
): Promise<OpAnswer> => {
  const adminId = await loginRowOn(container, caller, tenantId);
  const token = tokenFor(container, caller, adminId);

  let response: Response;
  try {
    response = await fetch(`${loopbackBase()}${op.path}`, {
      method: op.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(op.body ? { "content-type": "application/json" } : {}),
      },
      body: op.body ? JSON.stringify(op.body) : undefined,
    });
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The backend could not reach itself at ${loopbackBase()}: ${(error as Error).message}`,
    );
  }

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text.slice(0, 500) };
  }

  return { status: response.status, body };
};

/** `GET path` as the caller: the answer, `null` on a 404, an error on anything else. */
export const readAs = async (
  container: MedusaContainer,
  caller: Caller,
  tenantId: string,
  path: string,
): Promise<Record<string, unknown> | null> => {
  const answer = await callAs(container, caller, tenantId, { method: "GET", path });
  if (answer.status === 404) return null;
  if (answer.status >= 400) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Reading ${path} answered ${answer.status}: ${String(answer.body.message ?? "")}`,
    );
  }
  return answer.body;
};
