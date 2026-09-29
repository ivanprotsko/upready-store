"use client"

import type { HttpTypes } from "@medusajs/types"
import { isEqual } from "lodash"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"

type Options = Record<string, string | undefined>

export type ProductSelection = {
  /** The page's product: variants and options, no prices. */
  product: HttpTypes.StoreProduct
  /** Option id → chosen value. */
  options: Options
  setOptionValue: (optionId: string, value: string) => void
  /** The variant the chosen options name, or undefined while the choice is incomplete. */
  selectedVariant: HttpTypes.StoreProductVariant | undefined
  isValidVariant: boolean
  /** True while a cart request runs: the pickers disable themselves meanwhile. */
  busy: boolean
  setBusy: (busy: boolean) => void
  /**
   * The product WITH the region's prices, published by the buy box once
   * `ProductActionsWrapper` has fetched it; the details drawer's footer reads the price
   * and the stock off it. Undefined until then.
   */
  pricedProduct: HttpTypes.StoreProduct | undefined
  setPricedProduct: (product: HttpTypes.StoreProduct | undefined) => void
  /** Whether the «Характеристики и описание» drawer is open. */
  detailsOpen: boolean
  setDetailsOpen: (open: boolean) => void
  /** The button that opens the drawer: focus goes back to it when the drawer closes. */
  detailsOpenerRef: RefObject<HTMLButtonElement | null>
}

/** A variant's options as `{ [option_id]: value }`, the shape a choice is compared in. */
export const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
): Options =>
  variantOptions?.reduce((acc: Record<string, string>, varopt) => {
    if (varopt.option_id) acc[varopt.option_id] = varopt.value
    return acc
  }, {}) ?? {}

const ProductSelectionContext = createContext<ProductSelection | null>(null)

/**
 * The one place the product page keeps "which variant is chosen".
 *
 * The choice is made in the centre card (photo swatches, option chips) and spent in the
 * buy box (price, stock, the buttons) and in the phone's sticky bar, three components
 * that are not each other's children. Before the three-card layout the state lived
 * inside `ProductActions`, which owned the pickers too; now it sits above all of them.
 *
 * A one-variant product is chosen from the first render, on the server as well, so the
 * price and the button never flash through a "select a variant" state. Its URL is left
 * alone: there is no choice to share, and mirroring `?v_id=` on mount was a
 * `router.replace` whose RSC request re-rendered the page while the buyer's first
 * «В корзину» POST was in flight and cut it off (46df A-09).
 *
 * A product with several variants mirrors the chosen one into `?v_id=`, and a link that
 * carries `?v_id=` opens on that choice: the first render, on the server and on the
 * client alike, reads it from the URL, so nothing is replaced on mount either.
 */
export function ProductSelectionProvider({
  product,
  children,
}: {
  product: HttpTypes.StoreProduct
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const singleVariant = product.variants?.length === 1

  const [options, setOptions] = useState<Options>(() => {
    if (product.variants?.length === 1) {
      return optionsAsKeymap(product.variants[0].options)
    }
    const linkedId = searchParams.get("v_id")
    const linked = product.variants?.find((variant) => variant.id === linkedId)
    return linked ? optionsAsKeymap(linked.options) : {}
  })
  const [busy, setBusy] = useState(false)
  const [pricedProduct, setPricedProduct] = useState<
    HttpTypes.StoreProduct | undefined
  >(undefined)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsOpenerRef = useRef<HTMLButtonElement | null>(null)

  const setOptionValue = useCallback((optionId: string, value: string) => {
    setOptions((prev) => ({ ...prev, [optionId]: value }))
  }, [])

  const selectedVariant = useMemo(() => {
    if (!product.variants?.length) {
      return undefined
    }
    return product.variants.find((variant) =>
      isEqual(optionsAsKeymap(variant.options), options)
    )
  }, [product.variants, options])

  const isValidVariant = selectedVariant !== undefined

  useEffect(() => {
    if (singleVariant) {
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    const value = selectedVariant?.id ?? null

    if (params.get("v_id") === value) {
      return
    }

    if (value) {
      params.set("v_id", value)
    } else {
      params.delete("v_id")
    }

    router.replace(pathname + "?" + params.toString(), { scroll: false })
  }, [singleVariant, selectedVariant, pathname, router, searchParams])

  const value = useMemo<ProductSelection>(
    () => ({
      product,
      options,
      setOptionValue,
      selectedVariant,
      isValidVariant,
      busy,
      setBusy,
      pricedProduct,
      setPricedProduct,
      detailsOpen,
      setDetailsOpen,
      detailsOpenerRef,
    }),
    [
      product,
      options,
      setOptionValue,
      selectedVariant,
      isValidVariant,
      busy,
      pricedProduct,
      detailsOpen,
    ]
  )

  return (
    <ProductSelectionContext.Provider value={value}>
      {children}
    </ProductSelectionContext.Provider>
  )
}

export function useProductSelection(): ProductSelection {
  const selection = useContext(ProductSelectionContext)
  if (!selection) {
    throw new Error(
      "useProductSelection needs a ProductSelectionProvider above it"
    )
  }
  return selection
}
