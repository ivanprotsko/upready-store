/**
 * The four variables the school runs on (apps/school/README.md):
 *
 * - `SCHOOL_DOMAIN`: the school's host, `school.cherkashina.ru`. The address
 *   the shop sends the buyer back to is built from it. A value with a scheme,
 *   `http://localhost:5190`, is taken as the whole origin, for local work.
 * - `SCHOOL_API_BASE`: where the school's server reaches the shop's API.
 * - `SCHOOL_PUBLISHABLE_KEY`: the shop's publishable key. It tells the API
 *   which shop the buyer belongs to.
 * - `SCHOOL_SHOP_ORIGIN`: the shop the buyer signs in on, `https://cherkashino.ru`.
 *
 * A missing one fails the request with its name, never with a value.
 */
export type SchoolConfig = {
  schoolOrigin: string
  apiBase: string
  publishableKey: string
  shopOrigin: string
}

const trimSlash = (value: string) => value.replace(/\/+$/, "")

export function readConfig(env: NodeJS.ProcessEnv = process.env): SchoolConfig {
  const names = ["SCHOOL_DOMAIN", "SCHOOL_API_BASE", "SCHOOL_PUBLISHABLE_KEY", "SCHOOL_SHOP_ORIGIN"] as const
  const missing = names.filter((name) => !env[name]?.trim())

  if (missing.length > 0) {
    throw new Error(`The school is not configured: ${missing.join(", ")} not set`)
  }

  const domain = env.SCHOOL_DOMAIN!.trim()

  return {
    schoolOrigin: trimSlash(domain.includes("://") ? domain : `https://${domain}`),
    apiBase: trimSlash(env.SCHOOL_API_BASE!.trim()),
    publishableKey: env.SCHOOL_PUBLISHABLE_KEY!.trim(),
    shopOrigin: trimSlash(env.SCHOOL_SHOP_ORIGIN!.trim()),
  }
}
