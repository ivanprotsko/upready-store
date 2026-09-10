import Medusa from "@medusajs/js-sdk"

// tenant-panel: the Admin defaults to "/" (it is always served from the same
// origin as the backend, at /app). The panel's dev server proxies /auth and
// /tenants instead, so an empty __BACKEND_URL__ (proxy mode) must resolve to
// the page's own origin rather than a bare "/", which `Medusa({ baseUrl })`
// would otherwise treat as a relative path off the wrong base in some call
// shapes.
export const backendUrl = __BACKEND_URL__ || window.location.origin
const authType = __AUTH_TYPE__ ?? "session"
const jwtTokenStorageKey = __JWT_TOKEN_STORAGE_KEY__ || undefined

export const sdk = new Medusa({
  baseUrl: backendUrl,
  auth: {
    type: authType,
    jwtTokenStorageKey,
  },
})

// useful when you want to call the BE from the console and try things out quickly
if (typeof window !== "undefined") {
  ;(window as any).__sdk = sdk
}
