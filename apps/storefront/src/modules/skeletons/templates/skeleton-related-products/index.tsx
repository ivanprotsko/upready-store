import repeat from "@lib/util/repeat"
import { PRODUCT_GRID_CLASS } from "@modules/products/components/product-card"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

const SkeletonRelatedProducts = () => {
  return (
    <div className="product-page-constraint">
      <div className="mb-6 h-7 w-56 animate-pulse rounded bg-ui-bg-component motion-reduce:animate-none small:mb-8" />
      <ul className={PRODUCT_GRID_CLASS}>
        {repeat(4).map((index) => (
          <li key={index}>
            <SkeletonProductPreview />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SkeletonRelatedProducts
