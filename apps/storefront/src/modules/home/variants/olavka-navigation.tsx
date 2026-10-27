import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getOlavkaNavItems } from "@lib/data/olavka-home"
import Search from "@modules/layout/components/search"

import styles from "./olavka-navigation.module.css"

/**
 * One neutral chip for the search pill and every category (t-2026-10-20-61 D2): the node's ten
 * pastel tints made a rainbow row that competed with the banners. The pair is the theme's own
 * muted surface and foreground ink, so the row reads on the light and the dark preset alike.
 */
type ChipTint = { fill: string; ink: string; shade: string }

const NEUTRAL: ChipTint = { fill: "var(--muted)", ink: "var(--foreground)", shade: "var(--border)" }

const tintStyle = (tint: ChipTint) =>
  ({
    "--chip-fill": tint.fill,
    "--chip-ink": tint.ink,
    "--chip-shade": tint.shade,
  }) as React.CSSProperties

/**
 * Navigation · Olavka (t-2026-09-24-n15), Figma 227:9297: the search pill, then one
 * neutral pill per top-level category of THIS shop in alphabetical order (real tenant
 * data through `getOlavkaNavItems()`). The node also draws a «Курсы» pill; the storefront
 * has no courses listing route to point it at, so it appears only when the tenant owns
 * a category whose handle starts with `kurs`/`cours` — reported as an open question.
 *
 * Below 1024px (no mobile frame in the file): the same row, scrolling sideways.
 */
export default async function OlavkaNavigation() {
  const [t, items] = await Promise.all([getTranslations(), getOlavkaNavItems()])

  if (!items.length) {
    return null
  }

  return (
    <nav
      aria-label={t("CategoryMenu.title")}
      className={styles.block}
      data-testid="olavka-navigation"
    >
      <ul className={styles.row}>
        <li className={styles.item}>
          <Search className={styles.search} />
        </li>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <Link
              href={`/categories/${item.handle}`}
              className={styles.chip}
              style={tintStyle(NEUTRAL)}
              data-testid="olavka-navigation-link"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
