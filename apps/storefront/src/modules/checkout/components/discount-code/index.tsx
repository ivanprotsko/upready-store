"use client"

import React from "react"
import { useLocale, useTranslations } from "next-intl"
import { applyPromotions } from "@lib/data/cart"
import { convertToLocale } from "@lib/util/money"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import { Badge, Input } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"
import Trash from "@modules/common/icons/trash"
import ErrorMessage from "../error-message"
import { SubmitButton } from "../submit-button"

type DiscountCodeProps = {
  cart: HttpTypes.StoreCart
}

const DiscountCode: React.FC<DiscountCodeProps> = ({ cart }) => {
  const t = useTranslations("DiscountCode")
  const locale = useLocale()
  const [errorMessage, setErrorMessage] = React.useState("")
  const { trackCartUpdate } = useCartUpdate()

  const { promotions = [] } = cart
  const removePromotionCode = async (code: string) => {
    const validPromotions = promotions.filter(
      (promotion) => promotion.code !== code
    )

    await trackCartUpdate(() =>
      applyPromotions(
        validPromotions.filter((p) => p.code !== undefined).map((p) => p.code!)
      )
    )
  }

  const addPromotionCode = async (formData: FormData) => {
    setErrorMessage("")

    const code = formData.get("code")
    if (!code) {
      return
    }
    const input = document.getElementById("promotion-input") as HTMLInputElement
    const codes = promotions
      .filter((p) => p.code !== undefined)
      .map((p) => p.code!)
    codes.push(code.toString())

    try {
      await trackCartUpdate(() => applyPromotions(codes))
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }

    if (input) {
      input.value = ""
    }
  }

  return (
    <div className="flex w-full flex-col gap-y-2">
      {promotions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {promotions.map((promotion) => {
            const method = promotion.application_method
            return (
              <li
                key={promotion.id}
                className="flex items-center gap-x-2 rounded-full border border-ui-border-base py-1 ps-3 pe-2 txt-small-plus"
                data-testid="discount-row"
              >
                <span className="truncate" data-testid="discount-code">
                  <Badge color="green">{promotion.code}</Badge>
                  {method?.value !== undefined &&
                    method.currency_code !== undefined && (
                      <span className="ms-2 text-ui-fg-subtle">
                        {method.type === "percentage"
                          ? `${method.value}%`
                          : convertToLocale({
                              amount: +method.value,
                              currency_code: method.currency_code,
                              locale,
                            })}
                      </span>
                    )}
                </span>
                {!promotion.is_automatic && (
                  <button
                    type="button"
                    className="flex items-center p-1 text-ui-fg-subtle hover:text-ui-fg-base"
                    onClick={() => {
                      if (!promotion.code) {
                        return
                      }

                      removePromotionCode(promotion.code)
                    }}
                    data-testid="remove-discount-button"
                  >
                    <Trash size={14} />
                    <span className="sr-only">{t("removeDiscount")}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form action={(a) => addPromotionCode(a)} className="w-full">
        <div className="flex w-full gap-x-2">
          <Input
            id="promotion-input"
            name="code"
            aria-label={t("addPromotionCode")}
            placeholder={t("addPromotionCode")}
            data-testid="discount-input"
          />
          <SubmitButton variant="secondary" data-testid="discount-apply-button">
            {t("apply")}
          </SubmitButton>
        </div>
        <ErrorMessage
          error={errorMessage}
          data-testid="discount-error-message"
        />
      </form>
    </div>
  )
}

export default DiscountCode
