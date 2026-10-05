import { getSiteName } from "@lib/data/cookies"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { resolveTenantIcon } from "@lib/tenant/icon-file"
import { placeholderIconSvg } from "@lib/tenant/placeholder-icon"

/**
 * `/favicon.ico`, `/icon.svg` and `/apple-touch-icon.png` (also asked for as `/apple-icon.png`) of
 * the shop that was asked (t-2026-10-04-21). `src/middleware.ts` rewrites those root paths here with the tenant headers
 * set, so the branding read below is that shop's; `lib/tenant/icon-file.ts` decides the answer.
 * Short cache: the target changes the moment an owner uploads a new favicon.
 */
export const dynamic = "force-dynamic"

const CACHE_CONTROL = "public, max-age=300"

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const branding = await getSiteBranding()
  const target = resolveTenantIcon(file, branding)

  if (target.kind === "redirect") {
    return new Response(null, {
      status: 302,
      headers: { Location: target.url, "Cache-Control": CACHE_CONTROL },
    })
  }

  if (target.kind === "placeholder") {
    const svg = placeholderIconSvg({
      name: await getSiteName(),
      color: branding.primary_color,
      ink: branding.primary_foreground,
    })

    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE_CONTROL },
    })
  }

  return new Response(null, { status: 404, headers: { "Cache-Control": CACHE_CONTROL } })
}
