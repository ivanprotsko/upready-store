import { getTenantHome } from "@lib/data/tenant-home"

import type { ResolvedTemplate } from "./manifest"
import { getPreviewTemplate } from "./preview"

/**
 * The template this request renders with (t-2026-10-12-33), read by the root layout and
 * the home page:
 *
 *   1. the templates stand's preview, `?template=<id>` with `STOREFRONT_TEMPLATE_PREVIEW=1`;
 *   2. the template the shop saved in its home document (`POST /tenants/home/template`);
 *   3. null: no template, and both readers take the lines they had before templates.
 *
 * The second costs no round trip: `getTenantHome()` is the tagged fetch the layout and the
 * page already make for the shop's settings. The registry is imported only when the
 * document carries a template, so it stays out of the render of every other shop.
 */
export async function getActiveTemplate(): Promise<ResolvedTemplate | null> {
  const preview = await getPreviewTemplate()
  if (preview) return preview
  const home = await getTenantHome()
  if (!home?.template) return null
  const { resolveSavedTemplate } = await import("./saved")
  return resolveSavedTemplate(home)
}
