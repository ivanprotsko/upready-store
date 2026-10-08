/**
 * A `Set-Cookie` value read by meaning, for the tests: the order of the
 * attributes and the case of their names do not matter, and an attribute the
 * test does not expect, `Domain` above all, shows up under its own name.
 */
export type SetCookie = {
  name: string
  value: string
  httpOnly: boolean
  secure: boolean
  path?: string
  sameSite?: string
  maxAge?: number
  [other: string]: string | number | boolean | undefined
}

export function readSetCookie(header: string | null | undefined): SetCookie | null {
  if (!header) {
    return null
  }

  const [pair = "", ...attributes] = header.split(";").map((part) => part.trim())
  const eq = pair.indexOf("=")
  const cookie: SetCookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1), httpOnly: false, secure: false }

  for (const attribute of attributes) {
    const eqAt = attribute.indexOf("=")
    const key = (eqAt === -1 ? attribute : attribute.slice(0, eqAt)).toLowerCase()
    const value = eqAt === -1 ? "" : attribute.slice(eqAt + 1)

    if (key === "httponly") {
      cookie.httpOnly = true
    } else if (key === "secure") {
      cookie.secure = true
    } else if (key === "path") {
      cookie.path = value
    } else if (key === "samesite") {
      cookie.sameSite = value.toLowerCase()
    } else if (key === "max-age") {
      cookie.maxAge = Number(value)
    } else {
      cookie[key] = eqAt === -1 ? true : value
    }
  }

  return cookie
}
