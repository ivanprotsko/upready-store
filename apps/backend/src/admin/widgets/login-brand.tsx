import { useEffect } from "react"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

import { BRAND } from "../i18n"
import { holdDocumentTitle } from "../lib/hold-document-title"

/**
 * The sign-in page's tab title (t-2026-10-12-32 FX3). The dashboard builds it
 * as «<login.title> - Medusa»: @medusajs/dashboard 2.19.0 appends the suffix
 * itself (src/hooks/use-document-title.tsx) and no admin option changes it, so
 * src/admin/i18n alone leaves «Upready Store - Medusa». This widget renders
 * nothing and holds the tab at the brand while the sign-in page is open.
 * The second-factor step renders no login widgets and keeps the suffix.
 */
const LoginBrandWidget = () => {
  useEffect(() => holdDocumentTitle(BRAND), [])

  return null
}

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default LoginBrandWidget
