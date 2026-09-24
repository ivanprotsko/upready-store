import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getOlavkaNavItems } from "@lib/data/olavka-home"

/**
 * Navigation · Olavka redesign (t-2026-09-24-n15, Figma node 227-8180): the category
 * navigation of the home page, every top-level category of THIS shop in the owner's own
 * order, then "All products". Real tenant data through `getOlavkaNavItems()`; nothing
 * hard-coded.
 *
 * GROUNDWORK STATE: layout, sizes and states follow the Figma node once it is readable
 * (see `nav/variants/h7.tsx`). Until then this is a horizontally scrolling row, the one
 * shape that survives any category count at 390px.
 */
export default async function OlavkaNavigation() {
  const [t, items] = await Promise.all([getTranslations(), getOlavkaNavItems()])

  if (!items.length) {
    return null
  }

  return (
    <nav
      aria-label={t("CategoryMenu.title")}
      className="border-b border-ui-border-base bg-ui-bg-base"
      data-testid="olavka-navigation"
    >
      <ul className="content-container flex items-center gap-x-6 overflow-x-auto py-3 txt-compact-small [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <Link
              href={`/categories/${item.handle}`}
              className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="olavka-navigation-link"
            >
              {item.name}
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <Link
            href="/store"
            className="text-ui-fg-base font-medium hover:text-ui-fg-subtle transition-colors"
            data-testid="olavka-navigation-all"
          >
            {t("Store.allProducts")}
          </Link>
        </li>
      </ul>
    </nav>
  )
}
