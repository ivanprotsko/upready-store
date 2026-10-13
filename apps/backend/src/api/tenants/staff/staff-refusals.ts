/**
 * Every refusal the staff routes answer with, by code (t-2026-10-07-11, §13.1).
 *
 * The panel's request library keeps only the text and the status of an error,
 * so the text is what the panel recognises a refusal by and translates. That
 * is why the texts live in one file, why the routes take them only from here,
 * and why this file imports nothing: the panel's own test reads it as it is.
 * Changing a text here changes what the panel has to match.
 */
export const STAFF_REFUSALS = {
  email_taken_in_shop: "A login with this email already exists in this shop.",
  email_has_account:
    "This email already has an account on the platform, so a login with a new password cannot be created for it here. " +
    "Use another email, or ask platform support to attach the existing account to this shop.",
  own_role: "You cannot change your own role. Another owner of the shop can do it.",
  own_login: "You cannot remove your own login. Another owner of the shop can do it.",
  last_owner_remove:
    "This is the last owner of the shop; it cannot be removed. Make another login an owner first.",
  last_owner_demote:
    "This is the last owner of the shop; its role cannot be changed. Make another login an owner first.",
  password_shared:
    "This login is also used outside this shop, so its password cannot be changed here. " +
    "The person can change it in their own profile or through the reset link on the login page.",
  developer_row:
    "This is the platform developer's login. Only the platform changes or removes it, not the shop.",
} as const;
