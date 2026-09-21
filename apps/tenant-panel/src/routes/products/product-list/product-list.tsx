import { CORE_LAYOUT_IDS } from "@medusajs/admin-shared"

import { LayoutComposer } from "../../../components/layout-composer"
import { useFeatureFlag } from "../../../providers/feature-flag-provider"
import { ProductListTable } from "./components/product-list-table"
import { ConfigurableProductListTable } from "./components/product-list-table/configurable-product-list-table"

export const ProductList = () => {
  const isViewConfigEnabled = useFeatureFlag("view_configurations")

  return (
    <LayoutComposer
      widgetsZonePrefix="product.list"
      preferredLayoutId={CORE_LAYOUT_IDS.SINGLE_COLUMN}
      // o21-owner-panel-ux: the table renders the `Outlet` itself (as the orders
      // list does). With the composer's one on top, «Добавить товар» opened two
      // copies of the wizard, one under the other.
      hasOutlet={false}
      sections={{
        main: (
          <LayoutComposer.Entry id="ProductListTable">
            {isViewConfigEnabled ? (
              <ConfigurableProductListTable />
            ) : (
              <ProductListTable />
            )}
          </LayoutComposer.Entry>
        ),
      }}
    />
  )
}
