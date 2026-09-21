"use client"

import { addToCart } from "@lib/data/cart"
import { isPlaceholderOption } from "@lib/util/option-filter-groups"
import { optionsWithUsedValues } from "@lib/util/product"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { isEqual } from "lodash"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import ProductPrice from "../product-price"
import MobileActions from "./mobile-actions"
import { useRouter } from "next/navigation"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt) => {
    if (varopt.option_id) acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  disabled,
}: ProductActionsProps) {
  const t = useTranslations("ProductActions")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [options, setOptions] = useState<Record<string, string | undefined>>({})
  const [isAdding, setIsAdding] = useState(false)

  // If there is only 1 variant, preselect the options
  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [optionId]: value,
    }))
  }

  //check if the selected options produce a valid variant
  const isValidVariant = useMemo(() => {
    return product.variants?.some((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const value = (isValidVariant ? selectedVariant?.id : null) ?? null

    if (params.get("v_id") === value) {
      return
    }

    if (value) {
      params.set("v_id", value)
    } else {
      params.delete("v_id")
    }

    router.replace(pathname + "?" + params.toString(), { scroll: false })
  }, [selectedVariant, isValidVariant, pathname, router, searchParams])

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  // What a one-variant product is sold as («Фасовка: 50 гр»): its real option values,
  // never Medusa's "Default option" bookkeeping.
  const unitLine = useMemo(
    () =>
      (product.variants?.length ?? 0) === 1
        ? (product.options ?? [])
            .filter((option) => !isPlaceholderOption(option))
            .map((option) => ({
              title: option.title ?? "",
              value:
                product.variants?.[0]?.options?.find((value) => value.option_id === option.id)
                  ?.value ?? "",
            }))
            .filter((unit) => unit.title && unit.value)
        : [],
    [product]
  )

  const actionsRef = useRef<HTMLDivElement>(null)

  // The phone's sticky buy bar appears once the buy box has been scrolled PAST, not merely
  // while it is off screen: on first paint the box is still below the fold (the gallery
  // fills the first screen), and a bar shown then sat on top of the title and the price.
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    const box = actionsRef.current
    if (!box || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(([entry]) =>
      setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0)
    )
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The phone's sticky buy bar steps aside at the end of the page: over the footer it
  // would cover the seller's contacts, which is content too.
  const [footerInView, setFooterInView] = useState(false)
  useEffect(() => {
    const footer = document.querySelector("footer")
    if (!footer || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver(([entry]) => setFooterInView(entry.isIntersecting))
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null

    setIsAdding(true)

    await addToCart({
      variantId: selectedVariant.id,
      quantity: 1,
    })

    setIsAdding(false)
  }

  return (
    <>
      {/* The buy box, in the order a buyer reads it: what it costs, what exactly is sold
          (the unit of a one-variant product, the pickers of a many-variant one), whether
          it can be had, then the button. */}
      <div className="flex flex-col gap-y-4" ref={actionsRef}>
        <ProductPrice product={product} variant={selectedVariant} />

        {(product.variants?.length ?? 0) > 1 ? (
          <div className="flex flex-col gap-y-4">
            {optionsWithUsedValues(product).map((option) => {
              return (
                <div key={option.id}>
                  <OptionSelect
                    option={option}
                    current={options[option.id]}
                    updateOption={setOptionValue}
                    title={option.title ?? ""}
                    data-testid="product-options"
                    disabled={!!disabled || isAdding}
                  />
                </div>
              )
            })}
          </div>
        ) : unitLine.length > 0 ? (
          <dl className="flex flex-col gap-y-1" data-testid="product-unit">
            {unitLine.map((unit) => (
              <div key={unit.title} className="flex gap-x-2 txt-medium">
                <dt className="text-ui-fg-subtle">{unit.title}:</dt>
                <dd className="text-ui-fg-base">{unit.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {selectedVariant && !disabled ? (
          <p
            className="flex items-center gap-x-2 txt-compact-medium"
            data-testid="product-stock"
            data-in-stock={inStock && isValidVariant ? "true" : "false"}
          >
            <span
              aria-hidden
              className={
                inStock && isValidVariant
                  ? "size-2 rounded-full bg-ui-tag-green-icon"
                  : "size-2 rounded-full bg-ui-fg-muted"
              }
            />
            <span className={inStock && isValidVariant ? "text-ui-fg-base" : "text-ui-fg-subtle"}>
              {inStock && isValidVariant ? t("inStock") : t("outOfStock")}
            </span>
          </p>
        ) : (
          // The line keeps its place while the variant is unknown, so the button below
          // does not move when it appears.
          <p className="h-5" aria-hidden />
        )}

        <Button
          onClick={handleAddToCart}
          disabled={
            !inStock ||
            !selectedVariant ||
            !!disabled ||
            isAdding ||
            !isValidVariant
          }
          size="large"
          className="w-full"
          variant="primary"
          isLoading={isAdding}
          data-testid="add-product-button"
        >
          {!selectedVariant
            ? t("selectVariant")
            : !inStock || !isValidVariant
            ? t("outOfStock")
            : t("addToCart")}
        </Button>
        <MobileActions
          product={product}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          show={scrolledPast && !footerInView}
          optionsDisabled={!!disabled || isAdding}
        />
      </div>
    </>
  )
}
