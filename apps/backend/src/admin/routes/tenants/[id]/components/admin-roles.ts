/**
 * The roles of a shop login as the platform's forms name them
 * (t-2026-10-07-11). What a role may do is decided by the backend's own table;
 * this file only gives the values their Russian names. `developer` is the
 * platform's super admin inside a shop (t-2026-10-14-41): the shop's own form
 * never offers it, these platform forms do.
 */
export const TENANT_ADMIN_ROLES = [
  { value: "owner", label: "Владелец" },
  { value: "manager", label: "Менеджер" },
  { value: "operator", label: "Оператор" },
  { value: "developer", label: "Разработчик" },
] as const

export type TenantAdminRole = (typeof TENANT_ADMIN_ROLES)[number]["value"]

/** A login created without a role is an owner, as every login was before roles. */
export const DEFAULT_TENANT_ADMIN_ROLE: TenantAdminRole = "owner"

export const isTenantAdminRole = (value: unknown): value is TenantAdminRole =>
  TENANT_ADMIN_ROLES.some((role) => role.value === value)

/** A role this screen has no name for is shown as the backend spelled it. */
export const tenantAdminRoleLabel = (role: string | null | undefined): string =>
  TENANT_ADMIN_ROLES.find((known) => known.value === role)?.label ?? role ?? "—"
