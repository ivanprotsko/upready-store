import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"
import { PRODUCT_GRID_CLASS } from "@modules/products/components/product-card"
import { PRODUCT_LIMIT } from "@modules/store/templates/paginated-products"

const SkeletonProductGrid = ({
  numberOfProducts = PRODUCT_LIMIT,
}: {
  numberOfProducts?: number
}) => {
  return (
    <ul className={`${PRODUCT_GRID_CLASS} flex-1`} data-testid="products-list-loader">
      {repeat(numberOfProducts).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid
