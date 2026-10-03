"use client"

import { convertToLocale } from "@lib/util/money"
import { CheckCircleSolid, XMark } from "@medusajs/icons"
import type {
  HttpTypes,
  StoreCart,
  StoreCartShippingOption,
  StorePrice,
} from "@medusajs/types"
import { Link } from "@i18n/navigation"
import { Button, clx } from "@medusajs/ui"
import { useState } from "react"
import { useLocale } from "next-intl"
import type { StoreFreeShippingPrice } from "types/global"

const computeTarget = (
  cart: HttpTypes.StoreCart,
  price: HttpTypes.StorePrice
) => {
  const priceRule = (price.price_rules || []).find(
    (pr) => pr.attribute === "item_total"
  )!

  const currentAmount = cart.item_total
  const targetAmount = parseFloat(priceRule.value)

  if (priceRule.operator === "gt") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount > targetAmount,
      target_remaining:
        currentAmount > targetAmount ? 0 : targetAmount + 1 - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "gte") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount > targetAmount,
      target_remaining:
        currentAmount > targetAmount ? 0 : targetAmount - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "lt") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: targetAmount > currentAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : currentAmount + 1 - targetAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "lte") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: targetAmount > currentAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : currentAmount - targetAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount === targetAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : targetAmount - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  }
}

export default function ShippingPriceNudge({
  variant = "inline",
  cart,
  shippingOptions,
}: {
  variant?: "popup" | "inline"
  cart: StoreCart
  shippingOptions: StoreCartShippingOption[]
}) {
  if (!cart || !shippingOptions?.length) {
    return
  }

  // Check if any shipping options have a conditional price based on item_total
  const freeShippingPrice = shippingOptions
    .flatMap((shippingOption) => {
      const calculatedPrice = shippingOption.calculated_price

      if (!calculatedPrice) {
        return
      }

      // Get all prices that are:
      // 1. Currency code is same as the cart's
      // 2. Have a rule that is set on item_total
      const validCurrencyPrices = shippingOption.prices.filter(
        (price) =>
          price.currency_code === cart.currency_code &&
          (price.price_rules || []).some(
            (priceRule) => priceRule.attribute === "item_total"
          )
      )

      return validCurrencyPrices.map((price) => {
        return {
          ...price,
          shipping_option_id: shippingOption.id,
          ...computeTarget(cart, price),
        }
      })
    })
    .filter(Boolean)
    // We focus here entirely on free shipping, but this can be edited to handle multiple layers
    // of reduced shipping prices.
    .find((price) => price?.amount === 0)

  if (!freeShippingPrice) {
    return
  }

  if (variant === "popup") {
    return <FreeShippingPopup cart={cart} price={freeShippingPrice} />
  } else {
    return <FreeShippingInline cart={cart} price={freeShippingPrice} />
  }
}

function FreeShippingInline({
  cart,
  price,
}: {
  cart: StoreCart
  price: StorePrice & {
    target_reached: boolean
    target_remaining: number
    remaining_percentage: number
  }
}) {
  const locale = useLocale()
  return (
    <div className="bg-ui-bg-subtle p-2 rounded-lg border">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-ui-fg-subtle">
          <div>
            {price.target_reached ? (
              <div className="flex items-center gap-1.5">
                {" "}
                <CheckCircleSolid className="text-ui-tag-green-text inline-block" />{" "}
                Free Shipping unlocked!
              </div>
            ) : (
              `Unlock Free Shipping`
            )}
          </div>

          <div
            className={clx("visible", {
              "opacity-0 invisible": price.target_reached,
            })}
          >
            Only{" "}
            <span className="text-ui-fg-base">
              {convertToLocale({
                amount: price.target_remaining,
                currency_code: cart.currency_code,
                locale,
              })}
            </span>{" "}
            away
          </div>
        </div>
        <div className="flex justify-between gap-1">
          <div
            className={clx(
              "bg-gradient-to-r from-[var(--muted-foreground)] to-[var(--foreground)] h-1 rounded-full max-w-full duration-500 ease-in-out",
              {
                "from-[var(--success)] to-[color-mix(in_srgb,var(--success)_72%,var(--foreground))]": price.target_reached,
              }
            )}
            style={{ width: `${price.remaining_percentage}%` }}
          ></div>
          <div className="bg-ui-bg-component-hover h-1 rounded-full w-fit flex-grow"></div>
        </div>
      </div>
    </div>
  )
}

function FreeShippingPopup({
  cart,
  price,
}: {
  cart: StoreCart
  price: StoreFreeShippingPrice
}) {
  const [isClosed, setIsClosed] = useState(false)
  const locale = useLocale()

  return (
    <div
      className={clx(
        "fixed bottom-5 end-5 flex flex-col items-end gap-2 transition-all duration-500 ease-in-out z-10",
        {
          "opacity-0 invisible delay-1000": price.target_reached,
          "opacity-0 invisible": isClosed,
          "opacity-100 visible": !price.target_reached && !isClosed,
        }
      )}
    >
      <div>
        <Button
          className="rounded-full bg-ui-button-inverted shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] border-none text-[15px] p-2"
          onClick={() => setIsClosed(true)}
        >
          <XMark />
        </Button>
      </div>

      <div className="w-[400px] bg-ui-contrast-bg-base text-ui-contrast-fg-primary p-6 rounded-lg ">
        <div className="pb-4">
          <div className="space-y-3">
            <div className="flex justify-between text-[15px] text-ui-contrast-fg-secondary">
              <div>
                {price.target_reached ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircleSolid className="text-ui-tag-green-text inline-block" />{" "}
                    Free Shipping unlocked!
                  </div>
                ) : (
                  `Unlock Free Shipping`
                )}
              </div>

              <div
                className={clx("visible", {
                  "opacity-0 invisible": price.target_reached,
                })}
              >
                Only{" "}
                <span className="text-ui-contrast-fg-primary">
                  {convertToLocale({
                    amount: price.target_remaining,
                    currency_code: cart.currency_code,
                    locale,
                  })}
                </span>{" "}
                away
              </div>
            </div>
            <div className="flex justify-between gap-1">
              <div
                className={clx(
                  "bg-gradient-to-r from-[var(--muted-foreground)] to-[var(--foreground)] h-1.5 rounded-full max-w-full duration-500 ease-in-out",
                  {
                    "from-[var(--success)] to-[color-mix(in_srgb,var(--success)_72%,var(--foreground))]": price.target_reached,
                  }
                )}
                style={{ width: `${price.remaining_percentage}%` }}
              ></div>
              <div className="bg-ui-bg-component-hover h-1.5 rounded-full w-fit flex-grow"></div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link
            className="rounded-2xl bg-transparent shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] border-[1px] border-ui-contrast-border-base text-[15px] py-2.5 px-4"
            href="/cart"
          >
            View cart
          </Link>

          <Link
            className="flex-grow rounded-2xl bg-ui-contrast-fg-primary text-ui-contrast-bg-base shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] border-[1px] border-ui-contrast-border-base text-[15px] py-2.5 px-4 text-center"
            href="/store"
          >
            View products
          </Link>
        </div>
      </div>
    </div>
  )
}
