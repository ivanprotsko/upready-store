import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { LogosBrandsProps } from "./props"

/** Logos in a row from 1024 px; below it two, three from 720 px. */
const COLUMNS: Record<number, string> = {
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
  5: "small:grid-cols-5",
  6: "small:grid-cols-6",
}

/** The picture's share of the viewport at each width, for `next/image`. */
const sizesOf = (columns: number) =>
  `(min-width: 1024px) ${Math.round(100 / columns)}vw, (min-width: 720px) 33vw, 50vw`

/**
 * One box for every logo: a hard 3 : 2 frame (QR-IMG-ASPECT, one ratio for the role), the logo contained in its
 * middle two thirds across and half down, so a 5 : 1 wordmark meets the area's width, a square badge its height,
 * and neither towers. A share of the box, not a padding: a step padding leaves a compact template's logo filling
 * its card at 768 px. `group` lets the picture answer the box's hover and focus in `monochrome`.
 */
const BOX = "group flex aspect-[3/2] w-full items-center justify-center"

/** The logo's area inside the box. */
const AREA = "relative h-1/2 w-2/3"

const STYLE = {
  cards: "rounded-[var(--radius)] bg-[var(--secondary)]",
  plain: "",
} as const

/** The box as a link: the whole box is the target (≥ 44 px), with the template's focus ring. */
const LINK = clx(
  "min-h-11 transition-opacity hover:opacity-90 motion-reduce:transition-none",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
)

/** `monochrome`: the logo in one grey tone and quieter, in its colours on hover and focus. */
const MONOCHROME =
  "opacity-70 grayscale transition-[filter,opacity] duration-200 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0 motion-reduce:transition-none"

/**
 * `logos/brands` (t-2026-10-12-33): the brands a shop carries, in one band, «the real thing, from the makers you
 * know». A band of brand logos is on the home page of 6 of the 11 InSales themes R2 read (Cream, Bubble, Fine,
 * Grand, Idea, Loft) and of Tilda's home-goods shop (`artifacts/research/2026-10-13-templates-insales-tilda`,
 * `logo-list`); our own tokens throughout.
 *
 * - A list of 2–12 logos: two columns on a phone, three from 720 px, the template's three to six from 1024 px.
 * - `cards`: each logo on an equal card of `--secondary`, as InSales. `plain`: on the page, as Tilda.
 * - The brand's name is the picture's `alt`; a logo with `href` is a link the size of its box, named by it.
 * - `monochrome`: the logos in one grey tone, in colour on hover and focus; no transition under reduced motion.
 *
 * A logo whose picture the shop does not have is dropped; with fewer than two left the block draws nothing.
 * No heading of its own: the shell's header names the section.
 */
export default async function LogosBrands({ header, logos, style, columns, monochrome }: LogosBrandsProps) {
  const locale = await getLocale()
  const named = logos.flatMap((logo) => {
    const name = pickText(logo.name, locale)
    return name ? [{ logo, name }] : []
  })
  if (named.length < 2) {
    return null
  }

  const pictures = await Promise.all(named.map(({ logo }) => resolveImageRef(logo.image, locale)))
  const shown = named.flatMap(({ logo, name }, index) => {
    const picture = pictures[index]
    return picture ? [{ name, url: picture.url, href: logo.href }] : []
  })
  if (shown.length < 2) {
    return null
  }

  const sizes = sizesOf(columns)

  return (
    <BlockSection block="logos/brands" locale={locale} header={header}>
      <ul
        className={clx(
          "grid grid-cols-2 gap-[var(--layer-space-4,1rem)] min-[720px]:grid-cols-3",
          COLUMNS[columns] ?? COLUMNS[6],
          "small:gap-[var(--layer-space-6,1.5rem)]"
        )}
      >
        {shown.map((logo, index) => {
          const picture = (
            <div data-role="media" className={clx(AREA, monochrome && MONOCHROME)}>
              <Image src={logo.url} alt={logo.name} fill sizes={sizes} className="object-contain" />
            </div>
          )
          const box = clx(BOX, STYLE[style])
          return (
            <li key={index} data-role="logo" className="flex">
              {logo.href === null ? (
                <div className={box}>{picture}</div>
              ) : logo.href.startsWith("/") ? (
                <Link href={logo.href} className={clx(box, LINK)}>
                  {picture}
                </Link>
              ) : (
                <a href={logo.href} className={clx(box, LINK)}>
                  {picture}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </BlockSection>
  )
}
