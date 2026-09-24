import repeat from "@lib/util/repeat"
import { FRAME_ASPECT } from "@modules/products/components/product-media"
import {
  productRowItemClass,
  productRowListClass,
} from "@modules/products/components/product-row"
import { RELATED_PRODUCTS_COUNT } from "@modules/products/components/related-products"

/**
 * The «bought with this» row while it loads: the same centred heading slot, the same
 * strip or grid, the same frame ratio and text slots as a row tile, so the page does not
 * move when the products arrive.
 */
const SkeletonRelatedProducts = () => {
  return (
    <div
      className="flex animate-pulse flex-col motion-reduce:animate-none"
      aria-hidden
    >
      <div className="mx-auto mb-6 h-8 w-64 rounded bg-ui-bg-component small:mb-8 small:h-9" />
      <ul className={productRowListClass(4)}>
        {repeat(RELATED_PRODUCTS_COUNT).map((index) => (
          <li key={index} className={productRowItemClass(4)}>
            <div
              className="w-full rounded-[var(--radius,8px)] bg-ui-bg-subtle"
              style={{ aspectRatio: FRAME_ASPECT.card }}
            />
            <div className="mt-3 h-5 w-1/3 rounded bg-ui-bg-component" />
            <div className="mt-1 h-5 w-4/5 rounded bg-ui-bg-component" />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SkeletonRelatedProducts
