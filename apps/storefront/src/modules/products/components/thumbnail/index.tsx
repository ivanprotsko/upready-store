import { clx } from "@medusajs/ui"
import type React from "react"

import ProductMedia from "@modules/products/components/product-media"

type ThumbnailProps = {
  thumbnail?: string | null
  images?: { url?: string }[] | null
  alt?: string
  priority?: boolean
  size?: "small" | "medium" | "large" | "full" | "square"
  /** Kept for call-site compatibility; a featured card uses the same frame as any other. */
  isFeatured?: boolean
  className?: string
  "data-testid"?: string
}

/**
 * A product's picture in a list: a card, an order line, a home listing row.
 *
 * This used to crop every photo into a fixed 9:16 box with `object-cover`, and a profile's
 * `layout.imageTreatment` could swap that for another crop. Both are gone: the frame, its
 * ratio, the fit and the no-photo placeholder are `ProductMedia`'s, so a product looks the
 * same wherever it is listed and its photo is never cut. `size` only decides how wide the
 * frame is; `square` is the small mark next to a line of text.
 */
const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  alt,
  priority,
  size = "small",
  className,
  "data-testid": dataTestid,
}) => {
  const first = thumbnail || images?.[0]?.url || null
  const second = images?.find((image) => image.url && image.url !== first)?.url ?? null

  return (
    <ProductMedia
      src={first}
      secondSrc={size === "square" ? null : second}
      alt={alt ?? ""}
      context={size === "square" ? "line" : "card"}
      priority={priority}
      data-testid={dataTestid}
      className={clx(
        {
          "w-[180px]": size === "small",
          "w-[290px]": size === "medium",
          "w-[440px]": size === "large",
        },
        className
      )}
    />
  )
}

export default Thumbnail
