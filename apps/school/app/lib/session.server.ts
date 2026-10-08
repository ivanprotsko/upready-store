/**
 * The buyer's token in the `school_jwt` cookie: httpOnly, so no script on the
 * page can read it; Secure; SameSite=Lax, so it rides along when the shop
 * sends the buyer back; and with no `Domain`, so only the school's own host
 * ever gets it. Signing out of the school removes this cookie and nothing
 * else: the buyer stays signed in to the shop.
 */
export const SESSION_COOKIE = "school_jwt"

/** A week, the same as the shop's own `_medusa_jwt`. An older token is refused by the API and the buyer signs in again. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax"

export function readToken(request: Request): string | null {
  const header = request.headers.get("cookie") ?? ""

  for (const part of header.split(";")) {
    const eq = part.indexOf("=")

    if (eq !== -1 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim()

      return value ? decodeURIComponent(value) : null
    }
  }

  return null
}

export function setTokenCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${ATTRIBUTES}; Max-Age=${MAX_AGE_SECONDS}`
}

export function clearTokenCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`
}
