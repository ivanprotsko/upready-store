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
  useState,
  type ReactNode,
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
 * price and the button never flash through a "select a variant" state. The chosen
 * variant is mirrored into `?v_id=` so a shared link opens on the same choice.
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

  const [options, setOptions] = useState<Options>(() =>
    product.variants?.length === 1
      ? optionsAsKeymap(product.variants[0].options)
      : {}
  )
  const [busy, setBusy] = useState(false)

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
  }, [selectedVariant, pathname, router, searchParams])

  const value = useMemo<ProductSelection>(
    () => ({
      product,
      options,
      setOptionValue,
      selectedVariant,
      isValidVariant,
      busy,
      setBusy,
    }),
    [product, options, setOptionValue, selectedVariant, isValidVariant, busy]
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
