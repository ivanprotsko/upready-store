import { Button } from "@medusajs/ui"

import OrderCard from "../order-card"
import { Link } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"

// A server component on purpose: OrderCard is an async server component (getTranslations,
// getLocale, the status label lookups), and rendering it from a "use client" tree turns it
// into a client component, where next-intl throws "getTranslations is not supported in Client
// Components" — measured 2026-09-10 on kerbstone.upready.dev/en/account/orders: the page
// never left its loading spinner (storefront log, order-overview was "use client").
const OrderOverview = async ({ orders }: { orders: HttpTypes.StoreOrder[] }) => {
  const t = await getTranslations("OrderOverview")

  if (orders?.length) {
    return (
      <div className="flex flex-col gap-y-4 w-full">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="w-full flex flex-col items-center gap-y-4"
      data-testid="no-orders-container"
    >
      <h2 className="text-large-semi text-ui-fg-base">{t("nothingToSeeHere")}</h2>
      <p className="txt-medium text-ui-fg-subtle">{t("noOrdersYet")}</p>
      <div className="mt-4">
        <Link href="/">
          <Button data-testid="continue-shopping-button">
            {t("continueShopping")}
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default OrderOverview
