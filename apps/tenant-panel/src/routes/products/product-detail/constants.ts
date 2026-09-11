import {
  AdminProduct,
  AdminProductCategory,
  AdminShippingProfile,
} from "@medusajs/types"

// tenant-panel: the Admin wraps this field list in `getLinkedFields("product",
// ...)`, which reads `virtual:medusa/links` to append `+<link>.*` for every
// module link a plugin registered. The panel has no plugin system and no
// virtual modules (see dashboard-app/index.ts), so there are no extra linkable
// fields to append and the literal list is the whole answer.
export const PRODUCT_DETAIL_FIELDS = "*categories,*shipping_profile,-variants"

export type ExtendedProduct = AdminProduct & {
  categories?: AdminProductCategory[]
  shipping_profile?: AdminShippingProfile
}
