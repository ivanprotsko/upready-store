import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type { TenantAdminRole } from "../modules/tenant/models/tenant-admin";
import type TenantModuleService from "../modules/tenant/service";

/**
 * Who in a shop is its owner, and who is the platform (t-2026-10-14-41).
 *
 * Ivan, 14.10.2026, verbatim: «там сейчас три владельца, один из них аккаунт
 * агента судя по всему, но я мог его удалить. Короче говоря функционал сейчас
 * работает не так как ожидалось, нужно еще добавить роль "разработчик" это
 * буду я с ролью суперадмина».
 *
 * Three kinds of `owner` rows are not the business's owner, and this moves
 * each of them off the role:
 *
 *   - the platform's own row (`PLATFORM_ADMIN_EMAIL`, one in every shop)
 *     becomes a `developer`;
 *   - a developer's login (`developers`, Ivan's addresses) becomes a
 *     `developer`;
 *   - an agent's service login (`services`) becomes an `operator`, the
 *     narrowest role. It is demoted and never deleted: removing a login is
 *     Ivan's call.
 *
 * Only `owner` rows change. A row already moved, or with another role, is
 * left as it is, so a second run plans nothing. A shop left with no owner of
 * its own is named in the plan and still changed: the developer keeps every
 * permission there, so nobody loses access.
 */

export type StaffLogin = {
  id: string;
  email: string;
  role: TenantAdminRole;
  tenant_id: string;
  tenant_handle: string;
};

export type RoleChangeReason = "platform row" | "developer" | "service account";

export type RoleChange = {
  id: string;
  email: string;
  tenant_handle: string;
  from: TenantAdminRole;
  to: TenantAdminRole;
  reason: RoleChangeReason;
};

export type DeveloperRolePlan = {
  changes: RoleChange[];
  /** Handles of the shops that keep no owner of their own once the plan is applied. */
  shopsWithoutOwner: string[];
};

export type DeveloperRoleInput = {
  /** `PLATFORM_ADMIN_EMAIL`, or nothing when the platform has no row in the shops. */
  platformEmail?: string | null;
  developers: string[];
  services: string[];
};

const normalize = (email: string) => email.trim().toLowerCase();

/** A comma- or space-separated list of addresses, as an environment variable carries it. */
export const parseEmailList = (value: string | undefined | null): string[] =>
  (value ?? "")
    .split(/[\s,]+/)
    .map(normalize)
    .filter(Boolean);

export const planDeveloperRoles = (rows: StaffLogin[], input: DeveloperRoleInput): DeveloperRolePlan => {
  const platformEmail = input.platformEmail ? normalize(input.platformEmail) : null;
  const developers = new Set(input.developers.map(normalize));
  const services = new Set(input.services.map(normalize));

  // A developer is never demoted as a service account, and neither is the platform.
  const twice = [...services].filter((email) => developers.has(email) || email === platformEmail);
  if (twice.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Named as a service account and as a developer or the platform's row at once: ${twice.join(", ")}.`,
    );
  }

  const target = (email: string): { to: TenantAdminRole; reason: RoleChangeReason } | null => {
    if (platformEmail && email === platformEmail) {
      return { to: "developer", reason: "platform row" };
    }
    if (developers.has(email)) {
      return { to: "developer", reason: "developer" };
    }
    if (services.has(email)) {
      return { to: "operator", reason: "service account" };
    }
    return null;
  };

  const changes: RoleChange[] = [];
  for (const row of rows) {
    const move = row.role === "owner" ? target(normalize(row.email)) : null;
    if (move) {
      changes.push({
        id: row.id,
        email: row.email,
        tenant_handle: row.tenant_handle,
        from: row.role,
        to: move.to,
        reason: move.reason,
      });
    }
  }

  const changed = new Set(changes.map((change) => change.id));
  const touchedShops = new Set(
    rows.filter((row) => changed.has(row.id)).map((row) => row.tenant_id),
  );
  const shopsWithoutOwner = [...touchedShops]
    .filter((tenantId) =>
      !rows.some(
        (row) =>
          row.tenant_id === tenantId &&
          row.role === "owner" &&
          !changed.has(row.id) &&
          normalize(row.email) !== platformEmail,
      ),
    )
    .map((tenantId) => rows.find((row) => row.tenant_id === tenantId)!.tenant_handle)
    .sort();

  return { changes, shopsWithoutOwner };
};

export const describeDeveloperRolePlan = (plan: DeveloperRolePlan, applied: boolean): string[] => {
  const lines = plan.changes.map(
    (change) =>
      `${change.tenant_handle}: ${change.email} ${change.from} -> ${change.to} (${change.reason})${applied ? "" : " [dry run]"}`,
  );
  lines.push(
    `${plan.changes.length} login(s) ${applied ? "changed" : "to change"}` +
      (plan.shopsWithoutOwner.length ? `; no owner of its own left in: ${plan.shopsWithoutOwner.join(", ")}` : ""),
  );
  return lines;
};

/** Every live login of every live shop, the shop's handle with it. */
export const listStaffLogins = async (container: MedusaContainer): Promise<StaffLogin[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email", "role", "tenant.id", "tenant.handle"],
  });

  type Row = { id: string; email: string; role: TenantAdminRole; tenant?: { id?: string; handle?: string } | null };

  return (data as Row[]).flatMap((row) =>
    row.tenant?.id
      ? [
          {
            id: row.id,
            email: row.email,
            role: row.role,
            tenant_id: row.tenant.id,
            tenant_handle: row.tenant.handle ?? row.tenant.id,
          },
        ]
      : [],
  );
};

export const applyDeveloperRolePlan = async (container: MedusaContainer, plan: DeveloperRolePlan) => {
  if (!plan.changes.length) {
    return;
  }
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  await tenantModuleService.updateTenantAdmins(plan.changes.map((change) => ({ id: change.id, role: change.to })));
};
