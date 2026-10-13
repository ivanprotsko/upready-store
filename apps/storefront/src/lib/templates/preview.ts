import { headers } from "next/headers"

import type { ResolvedTemplate } from "./manifest"
import { TEMPLATE_PREVIEW_HEADER, templatePreviewEnabled } from "./preview-header"

/**
 * The template this request previews, or null (t-2026-10-12-33). Read by the three places
 * that already decide the look: `getEffectiveSettings()` (header, footer and home slots),
 * the root layout (`data-theme`, `data-mode`, the inline style) and the home page (the
 * sections). Nothing is saved: the template lives for the request that names it.
 *
 * With the flag off this returns before it reads the request, so a page that was static
 * stays static. The catalogue is imported only then too, which keeps the block registry
 * out of the live module graph of every shop.
 */
export async function getPreviewTemplate(): Promise<ResolvedTemplate | null> {
  if (!templatePreviewEnabled()) return null
  let id: string | null = null
  try {
    id = (await headers()).get(TEMPLATE_PREVIEW_HEADER)
  } catch {
    return null
  }
  if (!id) return null
  const { getTemplate } = await import("./catalog")
  return getTemplate(id)
}
