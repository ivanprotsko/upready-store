import { Dialog, Transition } from "@headlessui/react"
import type React from "react"
import { Fragment, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"

import useToggleState from "@lib/hooks/use-toggle-state"
import ChevronDown from "@modules/common/icons/chevron-down"
import X from "@modules/common/icons/x"

import { getProductPrice } from "@lib/util/get-product-price"
import OptionSelect from "./option-select"
import type { HttpTypes } from "@medusajs/types"
import { Button, clx } from "@medusajs/ui"
import { isSimpleProduct, optionsWithUsedValues } from "@lib/util/product"

type MobileActionsProps = {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  options: Record<string, string | undefined>
  updateOptions: (title: string, value: string) => void
  inStock?: boolean
  handleAddToCart: () => void
  isAdding?: boolean
  show: boolean
  optionsDisabled: boolean
}

const MobileActions: React.FC<MobileActionsProps> = ({
  product,
  variant,
  options,
  updateOptions,
  inStock,
  handleAddToCart,
  isAdding,
  show,
  optionsDisabled,
}) => {
  const t = useTranslations("ProductActions")
  const tCommon = useTranslations("Common")
  const locale = useLocale()
  const { state, open, close } = useToggleState()

  const price = getProductPrice({
    product: product,
    variantId: variant?.id,
    locale,
  })

  const selectedPrice = useMemo(() => {
    if (!price) {
      return null
    }
    const { variantPrice, cheapestPrice } = price

    return variantPrice || cheapestPrice || null
  }, [price])

  const isSimple = isSimpleProduct(product)

  return (
    <>
      {/* The sticky buy bar of a phone. It stands ON the bottom navigation (`bottom-16`,
          the nav's own height) instead of sliding under it with 80px of padding, and it is
          one row: the price, the variant picker when there is one, the button. The title
          is not repeated here; the page's own heading is a scroll away and the bar is
          what covers content, so it stays as low as a button. */}
      <div
        className={clx("lg:hidden inset-x-0 bottom-16 fixed z-30 overflow-hidden pt-4", {
          "pointer-events-none": !show,
        })}
      >
        <Transition
          as={Fragment}
          show={show}
          // Slides, never fades: a half-transparent bar lets the page's text show through its own.
          enter="ease-out duration-200 motion-reduce:transition-none"
          enterFrom="translate-y-full"
          enterTo="translate-y-0"
          leave="ease-in duration-150 motion-reduce:transition-none"
          leaveFrom="translate-y-0"
          leaveTo="translate-y-full"
        >
          <div
            className="flex w-full items-center gap-x-3 border-t border-ui-border-base bg-ui-bg-base px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
            data-testid="mobile-actions"
          >
            <span className="sr-only" data-testid="mobile-title">
              {product.title}
            </span>
            <div className="flex min-w-0 shrink-0 flex-col leading-tight tabular-nums">
              {selectedPrice ? (
                <>
                  <span
                    className={clx("text-base font-semibold", {
                      "text-ui-fg-error": selectedPrice.price_type === "sale",
                      "text-ui-fg-base": selectedPrice.price_type !== "sale",
                    })}
                  >
                    {selectedPrice.calculated_price}
                  </span>
                  {selectedPrice.price_type === "sale" && (
                    <span className="text-xs text-ui-fg-muted line-through">
                      {selectedPrice.original_price}
                    </span>
                  )}
                </>
              ) : null}
            </div>
            {!isSimple && (
              <Button
                onClick={open}
                size="large"
                variant="secondary"
                className="min-w-0 flex-1"
                data-testid="mobile-actions-button"
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-x-1">
                  <span className="truncate">
                    {variant
                      ? Object.values(options).join(" / ")
                      : t("selectOptions")}
                  </span>
                  <ChevronDown />
                </span>
              </Button>
            )}
            <Button
              onClick={handleAddToCart}
              size="large"
              disabled={!inStock || !variant}
              className="min-w-0 flex-1"
              isLoading={isAdding}
              data-testid="mobile-cart-button"
            >
              {!variant
                ? t("selectVariant")
                : !inStock
                ? t("outOfStock")
                : t("addToCart")}
            </Button>
          </div>
        </Transition>
      </div>
      <Transition appear show={state} as={Fragment}>
        <Dialog as="div" className="relative z-[75]" onClose={close}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-ui-bg-overlay bg-opacity-75 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed bottom-0 inset-x-0">
            <div className="flex min-h-full h-full items-center justify-center text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Dialog.Panel
                  className="w-full h-full transform overflow-hidden text-start flex flex-col gap-y-3"
                  data-testid="mobile-actions-modal"
                >
                  <div className="w-full flex justify-end pe-6">
                    <button
                      onClick={close}
                      aria-label={tCommon("close")}
                      className="bg-ui-bg-base w-12 h-12 rounded-full text-ui-fg-base flex justify-center items-center"
                      data-testid="close-modal-button"
                    >
                      <X />
                    </button>
                  </div>
                  <div className="bg-ui-bg-base px-6 py-12">
                    {(product.variants?.length ?? 0) > 1 && (
                      <div className="flex flex-col gap-y-6">
                        {optionsWithUsedValues(product).map((option) => {
                          return (
                            <div key={option.id}>
                              <OptionSelect
                                option={option}
                                current={options[option.id]}
                                updateOption={updateOptions}
                                title={option.title ?? ""}
                                disabled={optionsDisabled}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}

export default MobileActions
