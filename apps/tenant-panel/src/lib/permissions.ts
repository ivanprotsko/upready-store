import {
  type OwnerNavGroup,
  type OwnerTab,
} from "../components/layout/owner-nav/nav-model.ts"

/**
 * What a login may open (t-2026-10-07-11, Ivan 2026-10-07: «Ролей нет: каждый
 * логин видит весь магазин. Это нужно исправить»).
 *
 * The panel does not know which role may do what. `GET /tenants/me` answers
 * with the caller's `permissions`, and everything here looks only at that
 * list: the sidebar, the section tabs, the command menu and the route guard.
 * The server checks every request on its own, so this file decides what is
 * drawn, never what is allowed.
 *
 * Plain TS on purpose, free of React, so `src/__tests__/permissions.test.mjs`
 * imports and runs it as is.
 */
export const PERMISSIONS = [
  "orders",
  "customers",
  "reviews",
  "catalog",
  "storefront",
  "marketing",
  "marketplaces",
  "settings",
  "staff",
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** The role names the staff forms offer. What a role may do comes from the server. */
export const STAFF_ROLES = ["owner", "manager", "operator"] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export const isStaffRole = (value: unknown): value is StaffRole =>
  STAFF_ROLES.some((role) => role === value)

/**
 * The platform's super admin inside the shop (t-2026-10-14-41, Ivan
 * 14.10.2026: «нужно еще добавить роль "разработчик" это буду я с ролью
 * суперадмина»). The panel names it and never offers it: only the platform
 * gives it, and the shop changes nothing on a row that has it.
 */
export const PLATFORM_ROLES = ["developer"] as const

/** Every role the panel has a name for, in the order the catalogs list them. */
export const ROLE_NAMES = [...STAFF_ROLES, ...PLATFORM_ROLES] as const

export type RoleName = (typeof ROLE_NAMES)[number]

export const isRoleName = (value: unknown): value is RoleName =>
  ROLE_NAMES.some((role) => role === value)

const isPermission = (value: unknown): value is Permission =>
  PERMISSIONS.some((permission) => permission === value)

/**
 * The permission every address of the panel needs. The longest prefix that
 * owns an address wins, so `/settings/staff` is `staff` while the rest of
 * `/settings` is `settings`. `null` is a screen every role opens.
 *
 * `src/__tests__/permissions.test.mjs` fails when `app.tsx` registers an
 * address no row here owns, so a new screen cannot appear without a decision.
 */
export const ROUTE_PERMISSIONS: [prefix: string, permission: Permission | null][] = [
  ["/", null],
  ["/settings/profile", null],
  ["/orders", "orders"],
  ["/customers", "customers"],
  ["/reviews", "reviews"],
  ["/products", "catalog"],
  ["/categories", "catalog"],
  ["/product-attributes", "catalog"],
  ["/courses", "catalog"],
  ["/home-settings", "storefront"],
  ["/pages", "storefront"],
  ["/journal", "storefront"],
  ["/settings/branding", "storefront"],
  ["/promotions", "marketing"],
  ["/campaigns", "marketing"],
  ["/marketplaces", "marketplaces"],
  ["/marketplace-orders", "marketplaces"],
  ["/shipping", "settings"],
  ["/settings", "settings"],
  ["/settings/staff", "staff"],
]

/** Segment-aware prefix test, the same one the sidebar uses. */
const owns = (prefix: string, pathname: string) =>
  prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(prefix + "/")

const barePath = (to: string) => to.split(/[?#]/)[0]

/**
 * The permission an address needs: `null` when every role opens it,
 * `undefined` when no row owns it (an address the panel does not serve).
 */
export const permissionOfPath = (to: string): Permission | null | undefined => {
  const pathname = barePath(to)
  let best: { length: number; permission: Permission | null } | undefined
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    if (owns(prefix, pathname) && (!best || prefix.length > best.length)) {
      best = { length: prefix.length, permission }
    }
  }
  return best?.permission
}

/**
 * The caller's permissions as `GET /tenants/me` gave them. A server that
 * sends no list at all has no roles yet, and there every login sees the whole
 * shop, as before; an empty list means a login with nothing but the overview.
 * Until the answer is in, nothing is open.
 */
export const permissionsOf = (
  me: { permissions?: unknown } | null | undefined
): Permission[] => {
  if (!me) {
    return []
  }
  if (!Array.isArray(me.permissions)) {
    return [...PERMISSIONS]
  }
  return me.permissions.filter(isPermission)
}

export const can = (permissions: readonly Permission[], permission: Permission | null) =>
  permission === null || permissions.includes(permission)

/** An address no row owns is left to the router, which answers «not found». */
export const pathAllowed = (permissions: readonly Permission[], to: string) => {
  const permission = permissionOfPath(to)
  return permission === undefined || can(permissions, permission)
}

/**
 * The sidebar a login sees: the entries it may open, and no group left empty.
 * An entry with screens under it keeps the screens it may open and lands on
 * the first of them. An entry that stays whole is the same object as in the
 * model, which the sidebar relies on to light the open screen.
 */
export const visibleNav = (
  nav: OwnerNavGroup[],
  permissions: readonly Permission[]
): OwnerNavGroup[] =>
  nav.flatMap((group) => {
    const items = group.items.flatMap((item) => {
      if (!item.children) {
        return pathAllowed(permissions, item.to) ? [item] : []
      }
      const children = item.children.filter((child) => pathAllowed(permissions, child.to))
      if (children.length === item.children.length) {
        return [item]
      }
      return children.length ? [{ ...item, to: children[0].to, children }] : []
    })
    return items.length ? [{ ...group, items }] : []
  })

/** The tabs of a section a login may open. One tab left is not a row of tabs. */
export const visibleTabs = (tabs: OwnerTab[], permissions: readonly Permission[]): OwnerTab[] => {
  const allowed = tabs.filter((tab) => pathAllowed(permissions, tab.to))
  return allowed.length > 1 ? allowed : []
}
