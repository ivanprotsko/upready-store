import "server-only"
import {
  EMPTY_LOGIN_SETTINGS,
  parseLoginSettingsHeader,
  type TenantLoginSettings,
} from "@lib/tenant/login-settings"
import { decodeTenantHeaderValue } from "@lib/tenant/headers"
import { headers as nextHeaders } from "next/headers"

/**
 * Which sign-in forms THIS shop's buyers get (o25-login-methods). Behind
 * `import "server-only"` for the same reason `getSiteBranding` is —
 * `next/headers` throws in a client bundle, so a client component takes this
 * as a prop from a server parent (rule 19g).
 *
 * `EMPTY_LOGIN_SETTINGS` is the single-store fallback: a stand that resolves
 * no tenant gets no header, and every consumer renders exactly as it did
 * before this task (email and password, Yandex gated by the build-time flag).
 */
export const getSiteLoginSettings = async (): Promise<TenantLoginSettings> => {
  try {
    const headers = await nextHeaders()
    const parsed = parseLoginSettingsHeader(
      decodeTenantHeaderValue(headers.get("x-tenant-login"))
    )

    if (parsed) {
      return parsed
    }
  } catch {
    // No request context or a header this process cannot parse — render with
    // today's single-store behaviour rather than throw.
  }

  return EMPTY_LOGIN_SETTINGS
}
