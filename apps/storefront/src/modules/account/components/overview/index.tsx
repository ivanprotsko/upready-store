import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { convertToLocale } from "@lib/util/money"
import { joinFilled } from "@lib/util/address"
import { customerContactLabel, isSyntheticTelegramEmail } from "@lib/util/telegram-contact"
import OrderCard from "@modules/account/components/order-card"
import { OrderStageDot } from "@modules/order/components/order-stage"
import type { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
}

/** How many of the customer's latest orders the dashboard previews. */
const RECENT_LIMIT = 5

const Overview = async ({ customer, orders }: OverviewProps) => {
  const [t, tc, locale] = await Promise.all([
    getTranslations("AccountOverview"),
    getTranslations("Common"),
    getLocale(),
  ])
  const latestOrder = orders?.[0]

  return (
    <div className="w-full" data-testid="overview-page-wrapper">
      {/* This whole page used to sit behind `hidden small:block`, so an account
          opened on a phone showed nothing at all. */}
      <div className="flex flex-col gap-y-2 mb-8">
        <h1
          className="text-2xl-semi text-ui-fg-base"
          data-testid="welcome-message"
          data-value={customer?.first_name}
        >
          {t("hello", { name: customer?.first_name ?? "" })}
        </h1>
        <p className="txt-medium text-ui-fg-subtle">
          {t("signedInAs")}{" "}
          <span
            className="text-ui-fg-base"
            data-testid="customer-email"
            data-value={customer?.email}
          >
            {customerContactLabel(customer)}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-y-8">
        <section className="flex flex-wrap gap-x-16 gap-y-6 border-t border-ui-border-base pt-6">
          <Stat
            label={t("profile")}
            value={`${getProfileCompletion(customer)}%`}
            caption={t("completed")}
            data-testid="customer-profile-completion"
            data-value={getProfileCompletion(customer)}
          />
          <Stat
            label={t("addresses")}
            value={String(customer?.addresses?.length || 0)}
            caption={t("saved")}
            data-testid="addresses-count"
            data-value={customer?.addresses?.length || 0}
          />
        </section>

        {latestOrder && (
          <section
            className="flex flex-col gap-y-2 border-t border-ui-border-base pt-6"
            data-testid="latest-order-section"
          >
            <span className="txt-small text-ui-fg-subtle">
              {t("latestOrder")}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 txt-medium">
              <OrderStageDot order={latestOrder} />
              <span
                className="text-ui-fg-base"
                data-testid="latest-order-summary"
              >
                {joinFilled(
                  [
                    tc("orderNumber", {
                      id: latestOrder.display_id ?? latestOrder.id,
                    }),
                    joinFilled(
                      [
                        latestOrder.items?.[0]?.product_title,
                        latestOrder.items?.[0]?.variant_title,
                      ],
                      ", "
                    ),
                    convertToLocale({
                      amount: latestOrder.total,
                      currency_code: latestOrder.currency_code,
                      locale,
                    }),
                  ],
                  " · "
                )}
              </span>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-y-4 border-t border-ui-border-base pt-6">
          <h2 className="text-large-semi text-ui-fg-base">
            {t("recentOrders")}
          </h2>
          {/* The same card the orders page uses. The dashboard used to render a
              second, denser list of its own, so one account showed its orders
              two different ways. */}
          <div
            className="flex w-full flex-col gap-y-4"
            data-testid="orders-wrapper"
          >
            {orders && orders.length > 0 ? (
              orders
                .slice(0, RECENT_LIMIT)
                .map((order) => <OrderCard key={order.id} order={order} />)
            ) : (
              <p
                className="txt-medium text-ui-fg-subtle"
                data-testid="no-orders-message"
              >
                {t("noRecentOrders")}
              </p>
            )}
          </div>
        </section>

        <section
          className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ui-border-base pt-6 txt-small"
          data-testid="account-shortcuts"
        >
          <Link
            href="/account/orders"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            data-testid="shortcut-view-orders"
          >
            {t("shortcutViewOrders")}
          </Link>
          <Link
            href="/account/addresses"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            data-testid="shortcut-manage-addresses"
          >
            {t("shortcutManageAddresses")}
          </Link>
          <Link
            href="/account/profile"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            data-testid="shortcut-edit-profile"
          >
            {t("shortcutEditProfile")}
          </Link>
        </section>
      </div>
    </div>
  )
}

const Stat = ({
  label,
  value,
  caption,
  ...props
}: {
  label: string
  value: string
  caption: string
  "data-testid"?: string
  "data-value"?: string | number
}) => (
  <div className="flex flex-col gap-y-2">
    <h2 className="text-large-semi text-ui-fg-base">{label}</h2>
    <div className="flex items-baseline gap-x-2">
      <span className="text-3xl-semi leading-none" {...props}>
        {value}
      </span>
      <span className="uppercase txt-small text-ui-fg-subtle">{caption}</span>
    </div>
  </div>
)

const getProfileCompletion = (customer: HttpTypes.StoreCustomer | null) => {
  let count = 0

  if (!customer) {
    return 0
  }

  if (customer.email && !isSyntheticTelegramEmail(customer.email)) {
    count++
  }

  if (customer.first_name && customer.last_name) {
    count++
  }

  if (customer.phone) {
    count++
  }

  const billingAddress = customer.addresses?.find(
    (addr) => addr.is_default_billing
  )

  if (billingAddress) {
    count++
  }

  return (count / 4) * 100
}

export default Overview
