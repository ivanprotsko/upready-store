import { retrieveCart } from "@lib/data/cart"
import { ensureDigitalDelivery } from "@lib/data/checkout-digital"
import { defaultLocale, isAppLocale } from "@i18n/config"
import { type NextRequest, NextResponse } from "next/server"

/**
 * o24-courses part (c): `ensureDigitalDelivery` mutates the cart
 * (`setShippingMethod` / `updateCart`), and both call `revalidateTag`. Next.js
 * forbids `revalidateTag` "during render" — calling it straight from
 * `checkout/page.tsx`'s Server Component body threw `Route ... used
 * revalidateTag ... during render which is unsupported` on every digital-cart
 * checkout (found live by `e2e/courses/course-purchase.spec.ts`'s first run).
 * A Route Handler is not a render pass, so the mutation belongs here: the page
 * only reads the cart and, the ONE time a digital cart has no shipping method
 * yet, redirects here to attach it before redirecting back.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const requestedLocale = searchParams.get("locale")
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale

  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin

  const cart = await retrieveCart()
  const after = cart ? await ensureDigitalDelivery(cart) : null

  // Nothing attached (no digital option on this shop, or the cart still ships
  // something): say so in the URL, or the page would send the buyer straight back
  // here — the redirect loop of batch 6 / hotfix Plan B.
  const attached = (after?.shipping_methods?.length ?? 0) > 0
  return NextResponse.redirect(
    `${origin}/${locale}/checkout${attached ? "" : "?digital=skipped"}`
  )
}
