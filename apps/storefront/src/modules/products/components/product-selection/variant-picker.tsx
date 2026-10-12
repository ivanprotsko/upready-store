"use client"

import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import Image from "next/image"

import { isPlaceholderOption } from "@lib/util/option-filter-groups"
import { optionsWithUsedValues } from "@lib/util/product"
import OptionSelect from "@modules/products/components/product-actions/option-select"

import { useProductSelection } from "."

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive"

/** The first usable image a variant carries (`*variants.images` is in the product fields). */
const variantImage = (
  variant: HttpTypes.StoreProductVariant
): string | null => {
  const images = (variant as { images?: { url?: string | null }[] }).images
  return images?.find((image) => image.url)?.url ?? null
}

/**
 * Where a buyer chooses what exactly to buy, in the centre card under the title.
 *
 * A one-variant product has nothing to choose: it shows what it is sold as («Объём:
 * 100 мл»), from its real option values, never Medusa's "Default option" bookkeeping.
 *
 * A many-variant product shows one picker per option. An option whose values come with
 * their own variant photos is drawn as photo swatches, the way Ivan's Figma mockup draws
 * the sizes of the castor oil; a value without a photo of its own borrows the product's
 * thumbnail. An option with no photos to tell its values apart (a size run shot once,
 * a colour with a hex code) keeps the text chips and colour dots of `OptionSelect`.
 */
export default function VariantPicker() {
  const { product, options, setOptionValue } = useProductSelection()
  const variants = product.variants ?? []

  if (variants.length <= 1) {
    const units = (product.options ?? [])
      .filter((option) => !isPlaceholderOption(option))
      .map((option) => ({
        title: option.title ?? "",
        value:
          variants[0]?.options?.find((value) => value.option_id === option.id)
            ?.value ?? "",
      }))
      .filter((unit) => unit.title && unit.value)

    if (!units.length) {
      return null
    }

    return (
      <dl
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6"
        data-testid="product-unit"
      >
        {units.map((unit) => (
          <div key={unit.title} className="flex gap-x-1.5">
            <dt className="text-ui-fg-subtle">{unit.title}:</dt>
            <dd className="text-ui-fg-base">{unit.value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  const fallbackPhoto = product.thumbnail ?? product.images?.[0]?.url ?? null

  return (
    <div className="flex flex-col gap-y-4" data-testid="product-variant-picker">
      {optionsWithUsedValues(product)
        .filter((option) => !isPlaceholderOption(option))
        .map((option) => {
          const values = option.values ?? []
          const ownPhoto = new Map<string, string | null>()
          for (const value of values) {
            const owner = variants.find(
              (variant) =>
                variantImage(variant) &&
                variant.options?.some(
                  (variantOption) =>
                    variantOption.option_id === option.id &&
                    variantOption.value === value.value
                )
            )
            ownPhoto.set(value.value, owner ? variantImage(owner) : null)
          }
          const distinctPhotos = new Set(
            Array.from(ownPhoto.values()).filter(Boolean)
          )
          const asPhotos =
            distinctPhotos.size > 1 &&
            (fallbackPhoto || distinctPhotos.size === values.length)

          if (!asPhotos) {
            return (
              <OptionSelect
                key={option.id}
                option={option}
                current={options[option.id]}
                updateOption={setOptionValue}
                title={option.title ?? ""}
                data-testid="product-options"
              />
            )
          }

          const current = options[option.id]
          return (
            <div key={option.id} className="flex flex-col gap-y-2">
              <span className="text-sm leading-6 text-ui-fg-subtle">
                {option.title}
                {current ? (
                  <span className="text-ui-fg-base">: {current}</span>
                ) : null}
              </span>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={option.title ?? undefined}
                data-testid="product-options"
              >
                {values.map((value) => {
                  const photo = ownPhoto.get(value.value) ?? fallbackPhoto
                  const isSelected = value.value === current
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => setOptionValue(option.id, value.value)}
                      title={value.value}
                      aria-label={value.value}
                      aria-pressed={isSelected}
                      data-testid="option-button"
                      className={clx(
                        "relative h-[82px] w-[72px] overflow-hidden rounded-rounded bg-ui-bg-base transition-shadow",
                        FOCUS_RING,
                        isSelected
                          ? "ring-2 ring-ui-border-interactive"
                          : "ring-1 ring-ui-border-base hover:ring-ui-border-strong"
                      )}
                    >
                      {photo ? (
                        <Image
                          src={photo}
                          alt=""
                          fill
                          sizes="72px"
                          className="object-contain p-1"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-xs text-ui-fg-base">
                          {value.value}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
    </div>
  )
}
