import { clearSchoolJwtCookie, readSchoolJwt, serializeSchoolJwtCookie } from "./vendor/shop-sso"

/**
 * The buyer's token in the `school_jwt` cookie, written and read by the
 * package `@upready/shop-sso`: httpOnly, so no script on the page can read it;
 * Secure; SameSite=Lax, so it rides along when the shop sends the buyer back;
 * a week, the same as the shop's own `_medusa_jwt`; and with no `Domain`, so
 * only the school's own host ever gets it. Signing out of the school removes
 * this cookie and nothing else: the buyer stays signed in to the shop.
 *
 * This module stays the cabinet's door to the cookie, and its `.server` name
 * keeps it out of the browser's bundle.
 */

export function readToken(request: Request): string | null {
  return readSchoolJwt(request.headers.get("cookie"))
}

export function setTokenCookie(token: string): string {
  return serializeSchoolJwtCookie(token)
}

export function clearTokenCookie(): string {
  return clearSchoolJwtCookie()
}
