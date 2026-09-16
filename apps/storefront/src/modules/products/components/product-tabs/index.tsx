"use client"

import { useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"
import Back from "@modules/common/icons/back"
import FastDelivery from "@modules/common/icons/fast-delivery"
import Refresh from "@modules/common/icons/refresh"
import { Minus, Plus } from "@medusajs/icons"

type ProductTabsProps = {
  product: HttpTypes.StoreProduct
}

/**
 * Shipping and returns, as an accordion under the buy button.
 *
 * b17: the product description no longer lives here. It was the first thing in
 * this component and the longest text on the page, wedged into the narrow
 * column beside the gallery; it now has its own full-width block
 * (`components/product-description`), where the chrxnasdmds page puts it.
 * `product` stays on the props so the template keeps passing one component the
 * product it is about, and so a future tab has it to read.
 */
const ProductTabs = ({ product: _product }: ProductTabsProps) => {
  const t = useTranslations("ProductTabs")
  const [shippingOpen, setShippingOpen] = useState(false)

  return (
    <div className="w-full flex flex-col">
      <div className="border-b">
        <button
          className="flex items-center justify-between w-full py-3 txt-large text-ui-fg-subtle text-start"
          onClick={() => setShippingOpen((o) => !o)}
        >
          <span>{t("shippingReturns")}</span>
          {shippingOpen ? <Minus /> : <Plus />}
        </button>
        {shippingOpen && (
          <div className="pb-4">
            <ShippingInfoTab />
          </div>
        )}
      </div>
    </div>
  )
}

const ShippingInfoTab = () => {
  const t = useTranslations("ProductTabs")

  return (
    <div className="flex flex-col gap-y-6 text-sm">
      <div className="flex items-start gap-x-2">
        <FastDelivery />
        <div className="flex flex-col gap-y-1">
          <span className="font-medium text-ui-fg-base">
            {t("fastDelivery")}
          </span>
          <p className="text-ui-fg-subtle">{t("fastDeliveryDesc")}</p>
        </div>
      </div>
      <div className="flex items-start gap-x-2">
        <Refresh />
        <div className="flex flex-col gap-y-1">
          <span className="font-medium text-ui-fg-base">
            {t("simpleExchanges")}
          </span>
          <p className="text-ui-fg-subtle">{t("simpleExchangesDesc")}</p>
        </div>
      </div>
      <div className="flex items-start gap-x-2">
        <Back />
        <div className="flex flex-col gap-y-1">
          <span className="font-medium text-ui-fg-base">
            {t("easyReturns")}
          </span>
          <p className="text-ui-fg-subtle">{t("easyReturnsDesc")}</p>
        </div>
      </div>
    </div>
  )
}

export default ProductTabs
