import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"

import { Link } from "@i18n/navigation"
import ProductCard, {
  PRODUCT_GRID_CLASS,
  PRODUCT_GRID_COLLAPSE_BELOW,
  PRODUCT_GRID_COLLAPSED_CLASS,
  PRODUCT_GRID_COLLAPSED_ITEM_CLASS,
  PRODUCT_GRID_ROW_BUDGET,
} from "@modules/products/components/product-card"

/**
 * One vertical rhythm for every listing section of the home page. The section used to
 * stack a wrapper's padding on its own (48 + 96 px on a desktop), which read as a void
 * between the hero and the first products.
 */
export const HOME_SECTION_CLASS = "content-container py-10 small:py-14"

/** A real heading on the left, the way into the rest of the catalog on the right. */
export function ListingSectionHeader({
  heading,
  href,
  linkLabel,
}: {
  heading: string
  href?: string | null
  linkLabel?: string
}) {
  return (
    <div className="mb-6 flex items-baseline justify-between gap-4 small:mb-8">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl">
        {heading}
      </h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="shrink-0 rounded-sm text-sm font-medium text-ui-fg-interactive underline-offset-4 hover:text-ui-fg-interactive-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"
          data-testid="home-listing-see-all"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  )
}

/**
 * The grid itself is the catalog's: the same card, the same columns, the same gaps. What
 * a home section adds is a row budget (`PRODUCT_GRID_ROW_BUDGET`), so the grid never ends
 * on a ragged row, and, with fewer than four products, the collapsed grid, so it never
 * shows one row that is mostly empty.
 */
const ROW_BUDGET = PRODUCT_GRID_ROW_BUDGET

export default function ListingSection({
  heading,
  href,
  linkLabel,
  products,
  rows = "long",
  "data-testid": dataTestid,
}: {
  heading: string
  href?: string | null
  linkLabel?: string
  products: HttpTypes.StoreProduct[]
  rows?: keyof typeof ROW_BUDGET
  "data-testid"?: string
}) {
  const collapsed = products.length < PRODUCT_GRID_COLLAPSE_BELOW

  // Eager loading follows what is on the first screen: the first row of the widest grid.
  return (
    <li className={HOME_SECTION_CLASS} data-testid={dataTestid}>
      <ListingSectionHeader heading={heading} href={href} linkLabel={linkLabel} />
      <ul
        className={
          collapsed ? PRODUCT_GRID_COLLAPSED_CLASS : clx(PRODUCT_GRID_CLASS, ROW_BUDGET[rows])
        }
        data-product-grid="home"
        data-product-count={products.length}
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            className={clx("min-w-0", collapsed && PRODUCT_GRID_COLLAPSED_ITEM_CLASS)}
          >
            <ProductCard product={product} priority={index < 4} />
          </li>
        ))}
      </ul>
    </li>
  )
}
