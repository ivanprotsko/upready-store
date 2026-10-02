import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { listWishlistItems } from "@lib/data/wishlist"
import { pageTitle } from "@lib/util/page-title"
import AccountPageHeader from "@modules/account/components/account-page-header"
import WishlistList from "@modules/account/components/wishlist-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.wishlist")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
  }
}

export default async function Wishlist() {
  const items = await listWishlistItems()
  const t = await getTranslations("WishlistPage")

  return (
    <div className="w-full" data-testid="wishlist-page-wrapper">
      <AccountPageHeader heading={t("heading")} description={t("description")} />
      {items.length > 0 ? (
        <WishlistList items={items} />
      ) : (
        <p className="text-ui-fg-subtle" data-testid="wishlist-empty">
          {t("empty")}
        </p>
      )}
    </div>
  )
}
