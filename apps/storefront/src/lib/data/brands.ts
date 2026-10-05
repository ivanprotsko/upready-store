import { listCategories } from "@lib/data/categories"
import { brandsOf } from "@lib/util/brands"

/** The brands of the shop of this request; empty for a shop that keeps none. */
export const listBrands = async () => brandsOf(await listCategories())
