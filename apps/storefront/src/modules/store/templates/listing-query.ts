import type { OptionValueIds } from "@lib/util/product-option-filters"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"

/**
 * What one product list is: the catalog, a category, a collection, narrowed by the filters in
 * the address. The server renders the first screens from it (`ProductsListing`), hands it to the
 * browser, and every background batch (`loadProductBatch`) asks for the next products of the
 * SAME list with it, so a batch never mixes another sort or filter in.
 */
export type ListingInput = {
  sortBy?: SortOptions
  collectionId?: string
  categoryId?: string
  categoryIds?: string[]
  productsIds?: string[]
  countryCode: string
  optionValueIds?: OptionValueIds
  /**
   * The products a characteristic filter leaves (t15-product-attributes):
   * `undefined`/`null` when nothing is selected, an EMPTY ARRAY when the
   * selection matches nothing. The two are not the same: an empty `id` filter
   * is NO filter to Medusa and would put the whole catalogue back on the page,
   * so an empty array is the empty list.
   */
  attributeProductIds?: string[] | null
}

export type ListingQueryParams = {
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

/** The Store API filters of a list, or `null` when the filters leave nothing to ask for. */
export function listingQuery(input: ListingInput): ListingQueryParams | null {
  const queryParams: ListingQueryParams = {}

  if (input.collectionId) {
    queryParams.collection_id = [input.collectionId]
  }

  if (input.categoryIds?.length) {
    queryParams.category_id = input.categoryIds
  } else if (input.categoryId) {
    queryParams.category_id = [input.categoryId]
  }

  const { attributeProductIds, productsIds } = input

  if (attributeProductIds && attributeProductIds.length === 0) {
    return null
  }

  // Both narrowings are id lists, so the two intersect rather than override.
  const narrowedIds =
    attributeProductIds && productsIds
      ? productsIds.filter((id) => attributeProductIds.includes(id))
      : (attributeProductIds ?? productsIds)

  if (narrowedIds) {
    if (narrowedIds.length === 0) {
      return null
    }
    queryParams.id = narrowedIds
  }

  if (input.sortBy === "created_at") {
    queryParams.order = "created_at"
  }

  return queryParams
}

const SORTS: readonly SortOptions[] = ["price_asc", "price_desc", "created_at"]

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined

const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined)

/**
 * A list as the browser sent it back: only the fields `ListingInput` has, each of its own type.
 * A background batch is a public endpoint, so nothing else of what arrives reaches the Store API.
 */
export function readListingInput(raw: unknown): ListingInput | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const countryCode = typeof value.countryCode === "string" ? value.countryCode : null
  if (countryCode === null) return null

  const attribute = value.attributeProductIds

  return {
    sortBy: SORTS.includes(value.sortBy as SortOptions) ? (value.sortBy as SortOptions) : undefined,
    collectionId: text(value.collectionId),
    categoryId: text(value.categoryId),
    categoryIds: strings(value.categoryIds),
    productsIds: strings(value.productsIds),
    countryCode,
    optionValueIds: strings(value.optionValueIds),
    attributeProductIds: attribute === null ? null : strings(attribute),
  }
}
