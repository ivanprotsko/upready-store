/**
 * The address check of `/api/school-sso` (t-2026-10-08-36): where the shop may
 * send a buyer with a sign-in code for the school.
 *
 * The backend runs the same check before it mints a code
 * (`apps/backend/src/api/store/tenant/sso/school-sso.ts`, `allowedReturnUrl`),
 * from its own copy of `SCHOOL_SSO_RETURN_HOSTS`. This one exists so a bad
 * address answers 400 here, before the buyer is sent through a sign-in. The two
 * apps share no package (AGENTS.md, Localization), so the rule is written
 * twice and has a test on each side.
 */

/** `SCHOOL_SSO_RETURN_HOSTS`, comma separated, as lower-case hosts. */
export function parseReturnHosts(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * `raw` as a URL when it may receive a code, `null` otherwise. The host, with
 * its port when it is not the default one, has to be on the list. The scheme is
 * https, or http on localhost for development only, and the address carries no
 * user name or password.
 */
export function allowedSchoolReturnUrl(
  raw: string | null | undefined,
  hostsRaw: string | null | undefined
): URL | null {
  if (!raw) {
    return null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.username || url.password) {
    return null
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return null
  }

  return parseReturnHosts(hostsRaw).includes(url.host.toLowerCase())
    ? url
    : null
}
