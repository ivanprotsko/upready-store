import { retrieveCartSnapshot } from "@lib/data/cart"
import { getSitePromoCodeEnabled } from "@lib/data/tenant-promo-code"
import { getWishlistProductIds, isWishlistCustomerLoggedIn } from "@lib/data/wishlist"
import CartTemplate from "@modules/cart/templates"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { NOINDEX } from "@lib/util/robots"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.cart")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    robots: NOINDEX,
  }
}

type CartPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function Cart({ searchParams }: CartPageProps) {
  // The wishlist reads are the cached ones the cart sidebar makes on the same request,
  // for the hearts on the lines (t-2026-10-04-42).
  const [snapshot, { error }, wishlistLoggedIn, wishlistProductIds, promoCode] =
    await Promise.all([
      retrieveCartSnapshot(),
      searchParams,
      isWishlistCustomerLoggedIn().catch(() => false),
      getWishlistProductIds().catch(() => [] as string[]),
      getSitePromoCodeEnabled(),
    ])

  return (
    <CartTemplate
      snapshot={snapshot}
      error={error}
      wishlistLoggedIn={wishlistLoggedIn}
      wishlistProductIds={wishlistProductIds}
      promoCode={promoCode}
    />
  )
}
