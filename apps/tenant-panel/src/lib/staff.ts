import { isStaffRole, type StaffRole } from "./permissions.ts"

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

export type StaffDraft = {
  email: string
  firstName: string
  lastName: string
  role: StaffRole
  password: string
}

export type CreateStaffBody = {
  email: string
  password: string
  role: StaffRole
  first_name?: string
  last_name?: string
}

export type UpdateStaffBody = {
  role?: StaffRole
  first_name?: string
  last_name?: string
  password?: string
}

/** A key under `staff.errors` in the catalogs. */
export type StaffFormError = "emailRequired" | "passwordTooShort" | "nothingChanged"

/** The same length the platform's forms and the profile ask for. */
export const STAFF_PASSWORD_MIN = 12

export const staffName = (member: Pick<StaffMember, "first_name" | "last_name">) =>
  [member.first_name, member.last_name].filter(Boolean).join(" ")

/** A role the panel has no name for is shown as the server spelled it. */
export const staffRoleOf = (member: Pick<StaffMember, "role">): StaffRole | null =>
  isStaffRole(member.role) ? member.role : null

export const emptyStaffDraft = (): StaffDraft => ({
  email: "",
  firstName: "",
  lastName: "",
  role: "operator",
  password: "",
})

export const draftOfStaff = (member: StaffMember): StaffDraft => ({
  email: member.email,
  firstName: member.first_name ?? "",
  lastName: member.last_name ?? "",
  role: staffRoleOf(member) ?? "operator",
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

/** A login does not delete itself and does not change its own role. */
export const staffRowActions = (member: Pick<StaffMember, "is_self">) => ({
  canDelete: !member.is_self,
  canChangeRole: !member.is_self,
})

/** The server's own words for a refusal, the general text only when it sent none. */
export const staffErrorText = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message
    if (typeof message === "string" && message.trim()) {
      return message
    }
  }
  return fallback
}
