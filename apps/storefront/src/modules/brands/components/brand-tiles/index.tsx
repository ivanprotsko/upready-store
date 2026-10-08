import Image from "next/image"
import type { HttpTypes } from "@medusajs/types"

import { Link } from "@i18n/navigation"
import { categoryImage } from "@lib/util/category-image"

/**
 * The shop's brands as a grid of logos (ask a0e1): three across on a phone, six from 1024.
 * The logo is the picture the owner gave the brand's category in the panel; a brand with
 * none shows its name in the same frame, so a new brand is never an empty tile.
 */
export default function BrandTiles({
  brands,
  limit,
}: {
  brands: HttpTypes.StoreProductCategory[]
  /** The home block's cut; the brands page shows them all. */
  limit?: number
}) {
  const shown = limit ? brands.slice(0, limit) : brands

  return (
    <ul className="grid grid-cols-3 gap-3 small:grid-cols-6 small:gap-4" data-testid="brand-tiles">
      {shown.map((brand) => {
        const { url, alt } = categoryImage(brand)

        return (
          <li key={brand.id}>
            <Link
              href={`/categories/${brand.handle}`}
              title={brand.name}
              data-testid="brand-tile"
              data-brand-handle={brand.handle}
              className="group flex aspect-[3/2] items-center justify-center overflow-hidden rounded-[var(--radius,8px)] border border-ui-border-base bg-ui-bg-base p-3 transition-colors hover:border-ui-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive"
            >
              {url ? (
                <span className="relative block size-full">
                  <Image
                    src={url}
                    alt={alt || brand.name}
                    fill
                    quality={70}
                    sizes="(max-width: 1024px) 33vw, 16vw"
                    draggable={false}
                    className="object-contain"
                  />
                </span>
              ) : (
                <span className="line-clamp-2 break-words text-center text-sm font-semibold text-ui-fg-base group-hover:underline group-hover:underline-offset-2">
                  {brand.name}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
