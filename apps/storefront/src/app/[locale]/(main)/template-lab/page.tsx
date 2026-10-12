import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { templatePreviewEnabled } from "@lib/templates/preview-header"

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * The block playground of the templates stand (t-2026-10-12-33): every registered block
 * variant on this shop's catalogue, and the links to each template's preview. A 404 unless
 * `STOREFRONT_TEMPLATE_PREVIEW=1`; the playground module is imported only past that check.
 */
export default async function TemplateLabPage() {
  if (!templatePreviewEnabled()) {
    notFound()
  }
  const { default: BlockPlayground } = await import("@modules/blocks/playground")
  return <BlockPlayground />
}
