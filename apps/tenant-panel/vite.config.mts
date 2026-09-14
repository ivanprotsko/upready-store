import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

/**
 * Mirrors packages/admin/dashboard/vite.config.mts from the Medusa monorepo,
 * minus the admin extension plugin (the panel has no extensions).
 *
 * The backend is reached two ways. By default the dev server proxies `/auth`
 * and `/tenants` to VITE_MEDUSA_BACKEND_URL, so the browser talks to one
 * origin and the session cookie stays first-party; `__BACKEND_URL__` is then
 * empty and lib/client falls back to window.location.origin. Set
 * VITE_MEDUSA_BACKEND_DIRECT=true to call the backend cross-origin instead.
 * Mind that Medusa applies CORS only to /admin, /store and /auth, so the
 * direct mode needs a CORS middleware on /tenants/* that the backend does not
 * ship yet.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  const BASE = env.VITE_MEDUSA_BASE || "/"
  const BACKEND_URL = env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9023"
  const DIRECT = env.VITE_MEDUSA_BACKEND_DIRECT === "true"
  const STOREFRONT_URL =
    env.VITE_MEDUSA_STOREFRONT_URL || "http://localhost:8000"
  // The DNS instruction the Domains screen shows a shop owner. It is a
  // deployment fact, not a code constant: the same panel build serves whichever
  // platform it is deployed on, so it comes from the environment
  // (`docs/multitenancy/storefront-by-host.md` §2 fixes the default).
  const CNAME_TARGET = env.VITE_TENANT_CNAME_TARGET || "stores.upready.dev"

  return {
    base: BASE,
    plugins: [react()],
    define: {
      __BASE__: JSON.stringify(BASE),
      __BACKEND_URL__: JSON.stringify(DIRECT ? BACKEND_URL : ""),
      __STOREFRONT_URL__: JSON.stringify(STOREFRONT_URL),
      __CNAME_TARGET__: JSON.stringify(CNAME_TARGET),
      __AUTH_TYPE__: JSON.stringify("session"),
      __JWT_TOKEN_STORAGE_KEY__: JSON.stringify(""),
      // tenant-panel: read by the copied components/common/file-upload,
      // which already falls back to 1MB when undefined.
      __MAX_UPLOAD_FILE_SIZE__: "undefined",
    },
    server: {
      port: 5180,
      strictPort: true,
      proxy: DIRECT
        ? undefined
        : {
            "/auth": { target: BACKEND_URL, changeOrigin: false },
            "/tenants": { target: BACKEND_URL, changeOrigin: false },
          },
    },
    preview: {
      port: 5180,
      strictPort: true,
    },
  }
})
