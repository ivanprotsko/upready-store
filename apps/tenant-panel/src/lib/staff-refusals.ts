/**
 * The refusals of the staff routes, by the words the server says them in
 * (t-2026-10-07-11, addendum 13). The request library keeps only the text and
 * the status of a failed answer, so the text is the one way to tell the
 * refusals apart. Each maps to its code, the same eight codes the backend
 * lists in `apps/backend/src/api/tenants/staff/staff-refusals.ts`, and the
 * catalogs hold the owner's own words under `staff.refusals.<code>`.
 *
 * `src/__tests__/staff-refusals.test.mjs` reads the backend's file and fails
 * when a text there has no row here or a code has no translation.
 */
export const STAFF_REFUSAL_CODES: Record<string, string> = {
  "A login with this email already exists in this shop.": "email_taken_in_shop",
  "This email already has an account on the platform, so a login with a new password cannot be created for it here. Use another email, or ask platform support to attach the existing account to this shop.":
    "email_has_account",
  "You cannot change your own role. Another owner of the shop can do it.": "own_role",
  "You cannot remove your own login. Another owner of the shop can do it.": "own_login",
  "This is the last owner of the shop; it cannot be removed. Make another login an owner first.":
    "last_owner_remove",
  "This is the last owner of the shop; its role cannot be changed. Make another login an owner first.":
    "last_owner_demote",
  "This login is also used outside this shop, so its password cannot be changed here. The person can change it in their own profile or through the reset link on the login page.":
    "password_shared",
  "This is the platform developer's login. Only the platform changes or removes it, not the shop.":
    "developer_row",
}

/** The key of a refusal's translation, or null for a text the table does not know. */
export const staffRefusalKey = (message: string): string | null => {
  const code = STAFF_REFUSAL_CODES[message.replace(/\s+/g, " ").trim()]
  return code ? `staff.refusals.${code}` : null
}
