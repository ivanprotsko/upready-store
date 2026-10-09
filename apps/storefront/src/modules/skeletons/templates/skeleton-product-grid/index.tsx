import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"
import {
  PRODUCT_GRID_BESIDE_SIDEBAR_CLASS,
  PRODUCT_GRID_CLASS,
} from "@modules/products/components/product-card"
import { PRODUCT_LIMIT } from "@modules/store/templates/products-listing"

/** `besideSidebar`: the loader of a grid that stands beside the catalog's side column. */
const SkeletonProductGrid = ({
  numberOfProducts = PRODUCT_LIMIT,
  besideSidebar = false,
}: {
  numberOfProducts?: number
  besideSidebar?: boolean
}) => {
  const grid = besideSidebar ? PRODUCT_GRID_BESIDE_SIDEBAR_CLASS : PRODUCT_GRID_CLASS

  return (
    <ul className={`${grid} flex-1`} data-testid="products-list-loader">
      {repeat(numberOfProducts).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid
