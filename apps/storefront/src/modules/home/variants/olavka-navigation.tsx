import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getOlavkaNavItems } from "@lib/data/olavka-home"
import Search from "@modules/layout/components/search"

import styles from "./olavka-navigation.module.css"

/**
 * The node's tints, keyed by the English slug its `CategoryButton2` instances carry
 * (`Name=antiseptics` …). A tenant category matches by the Russian transliteration its
 * handle starts with (`antiseptiki-cherkashino` → antiseptics); a category the node never
 * drew takes the next unused tint, so a new category is never uncoloured.
 */
type ChipTint = { fill: string; ink: string; shade: string }

const TINTS: Record<string, ChipTint> = {
  search: { fill: "#efeee5", ink: "#1d1e18", shade: "#5e5b3a" },
  courses: { fill: "#dce5c6", ink: "#232d12", shade: "#55702b" },
  antiseptics: { fill: "#d2e3df", ink: "#172925", shade: "#3e6b63" },
  asd: { fill: "#c9dcdd", ink: "#122527", shade: "#33595b" },
  supplements: { fill: "#ead5c9", ink: "#351b10", shade: "#8a4b32" },
  oils: { fill: "#f2ddc4", ink: "#3b2210", shade: "#9a5a24" },
  honey: { fill: "#f5e4bc", ink: "#372605", shade: "#8f6512" },
  multicookers: { fill: "#dedfd8", ink: "#24251f", shade: "#5a5d53" },
  stevia: { fill: "#dfe5cf", ink: "#272e1b", shade: "#66774a" },
  stimulants: { fill: "#f0d5c8", ink: "#38190c", shade: "#8f4526" },
  "phyto-candles": { fill: "#e3d3e1", ink: "#2b1b2a", shade: "#6e4c6b" },
}

const HANDLE_PREFIX_TO_TINT: [string, string][] = [
  ["kurs", "courses"],
  ["cours", "courses"],
  ["antiseptik", "antiseptics"],
  ["asd", "asd"],
  ["dobavk", "supplements"],
  ["masl", "oils"],
  ["myod", "honey"],
  ["med-", "honey"],
  ["multivark", "multicookers"],
  ["stevi", "stevia"],
  ["stimulyator", "stimulants"],
  ["fito-svech", "phyto-candles"],
]

const FALLBACK_ORDER = [
  "antiseptics",
  "asd",
  "supplements",
  "oils",
  "honey",
  "multicookers",
  "stevia",
  "stimulants",
  "phyto-candles",
  "courses",
]

function tintFor(handle: string, used: Set<string>): ChipTint {
  const hit = HANDLE_PREFIX_TO_TINT.find(([prefix]) => handle.startsWith(prefix))?.[1]
  const key = hit ?? FALLBACK_ORDER.find((k) => !used.has(k)) ?? FALLBACK_ORDER[used.size % FALLBACK_ORDER.length]
  used.add(key)
  return TINTS[key]
}

const tintStyle = (tint: ChipTint) =>
  ({
    "--chip-fill": tint.fill,
    "--chip-ink": tint.ink,
    "--chip-shade": tint.shade,
  }) as React.CSSProperties

/**
 * Navigation · Olavka (t-2026-09-24-n15), Figma 227:9297: the search pill, then one
 * tinted pill per top-level category of THIS shop in alphabetical order (real tenant
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

  const used = new Set<string>()

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
              style={tintStyle(tintFor(item.handle, used))}
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
