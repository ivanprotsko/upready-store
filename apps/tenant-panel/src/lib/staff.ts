import {
  PERMISSIONS,
  PLATFORM_ROLES,
  STAFF_ROLES,
  isRoleName,
  type Permission,
  type RoleName,
} from "./permissions.ts"
import { staffRefusalKey } from "./staff-refusals.ts"

/**
 * The staff screen's data rules (t-2026-10-07-11), free of React so
 * `src/__tests__/staff.test.mjs` imports and runs them as is: what a form
 * sends, what it refuses before asking the server, and which actions a row
 * offers. The server owns every other refusal (the last owner, an address
 * already taken, somebody else's account) and its text is shown as it came.
 */
export type StaffMember = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string
  created_at: string
  updated_at: string
  /** The row of the login that asked. */
  is_self: boolean
}

/**
 * A role and what it opens, as `GET /tenants/staff` lists them next to the
 * logins (the lead's answer 12.3 of the task's brief). The server's table is
 * the only one: the form's list of roles and the line under it are read here.
 */
export type StaffRoleGrant = { role: string; permissions: string[] }

export type StaffDraft = {
  email: string
  firstName: string
  lastName: string
  role: string
  password: string
}

export type CreateStaffBody = {
  email: string
  password: string
  role: string
  first_name?: string
  last_name?: string
}

export type UpdateStaffBody = {
  role?: string
  first_name?: string
  last_name?: string
  password?: string
}

/** A key under `staff.errors` in the catalogs. */
export type StaffFormError = "emailRequired" | "passwordTooShort" | "nothingChanged"

/** The same length the platform's forms and the profile ask for. */
export const STAFF_PASSWORD_MIN = 8

export const staffName = (member: Pick<StaffMember, "first_name" | "last_name">) =>
  [member.first_name, member.last_name].filter(Boolean).join(" ")

/** A role the panel has no name for is shown as the server spelled it. */
export const staffRoleOf = (member: Pick<StaffMember, "role">): RoleName | null =>
  isRoleName(member.role) ? member.role : null

const isPlatformRole = (role: string) => PLATFORM_ROLES.some((platform) => platform === role)

/**
 * The colour of a role's badge in the list (panel-ds E7: one function per
 * entity). The platform's developer stands apart from the shop's own people,
 * in a colour no state of the panel uses (t-2026-10-14-41).
 */
export const staffRoleColor = (role: string): "purple" | "grey" =>
  isPlatformRole(role) ? "purple" : "grey"

/**
 * The roles the form offers, in the server's order; the three names when it
 * sent none. The platform's roles are never among them, whatever the server
 * lists: only the platform gives them.
 */
export const staffRoleOptions = (roles: StaffRoleGrant[] | undefined): string[] =>
  (roles?.length ? roles.map((grant) => grant.role) : [...STAFF_ROLES]).filter(
    (role) => !isPlatformRole(role)
  )

/**
 * What a role opens, for the line under the role select: the permissions the
 * server lists for it, in the panel's own order. Empty when the server did
 * not list the role, and then the form shows no line rather than a guess.
 */
export const roleSees = (roles: StaffRoleGrant[] | undefined, role: string): Permission[] => {
  const granted = roles?.find((grant) => grant.role === role)?.permissions ?? []
  return PERMISSIONS.filter((permission) => granted.includes(permission))
}

/** The role a new login starts with: the one that opens least, the last one on a tie. */
export const leastRole = (roles: StaffRoleGrant[] | undefined): string => {
  const options = staffRoleOptions(roles)
  return options.reduce(
    (least, role) => (roleSees(roles, role).length <= roleSees(roles, least).length ? role : least),
    options[0]
  )
}

export const emptyStaffDraft = (roles?: StaffRoleGrant[]): StaffDraft => ({
  email: "",
  firstName: "",
  lastName: "",
  role: leastRole(roles),
  password: "",
})

export const draftOfStaff = (member: StaffMember): StaffDraft => ({
  email: member.email,
  firstName: member.first_name ?? "",
  lastName: member.last_name ?? "",
  role: member.role,
  password: "",
})

export const createStaffBody = (
  draft: StaffDraft
): { body: CreateStaffBody } | { error: StaffFormError } => {
  const email = draft.email.trim()
  if (!email) {
    return { error: "emailRequired" }
  }
  if (draft.password.length < STAFF_PASSWORD_MIN) {
    return { error: "passwordTooShort" }
  }
  const firstName = draft.firstName.trim()
  const lastName = draft.lastName.trim()
  return {
    body: {
      email,
      password: draft.password,
      role: draft.role,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
    },
  }
}

/**
 * Only what changed is sent. An empty password field keeps the password. A
 * login cannot change its own role, so the role of its own row is never sent.
 */
export const updateStaffBody = (
  member: StaffMember,
  draft: StaffDraft
): { body: UpdateStaffBody } | { error: StaffFormError } => {
  const body: UpdateStaffBody = {}
  const firstName = draft.firstName.trim()
  const lastName = draft.lastName.trim()
  if (firstName !== (member.first_name ?? "")) {
    body.first_name = firstName
  }
  if (lastName !== (member.last_name ?? "")) {
    body.last_name = lastName
  }
  if (!member.is_self && draft.role !== member.role) {
    body.role = draft.role
  }
  if (draft.password.length > 0) {
    if (draft.password.length < STAFF_PASSWORD_MIN) {
      return { error: "passwordTooShort" }
    }
    body.password = draft.password
  }
  return Object.keys(body).length ? { body } : { error: "nothingChanged" }
}

/**
 * A login does not delete itself and does not change its own role. A row with
 * a platform role is the platform's: the shop opens no form on it and removes
 * nothing (t-2026-10-14-41), and the server refuses both anyway.
 */
export const staffRowActions = (member: Pick<StaffMember, "is_self" | "role">) => {
  const platform = isPlatformRole(member.role)
  return {
    canEdit: !platform,
    canDelete: !member.is_self && !platform,
    canChangeRole: !member.is_self && !platform,
  }
}

/**
 * What the owner reads when the server refuses. A refusal the table knows
 * (`lib/staff-refusals.ts`) is said in the panel's language; any other is
 * shown in the server's own words, and the general text only when it sent none.
 */
export const staffErrorText = (
  error: unknown,
  fallback: string,
  translate?: (key: string) => string
): string => {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message
    if (typeof message === "string" && message.trim()) {
      const key = staffRefusalKey(message)
      return key && translate ? translate(key) : message
    }
  }
  return fallback
}
