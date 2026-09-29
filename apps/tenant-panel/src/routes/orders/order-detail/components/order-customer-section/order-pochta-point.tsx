import { Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"

type PochtaData = {
  provider?: string
  pochta_point_index?: string
  pochta_point_name?: string | null
  pochta_point_address?: string | null
  pochta_point_city?: string | null
  pochta_point_region?: string | null
  term_label?: string | null
  tariff_source?: string | null
}

/**
 * The Russian Post pickup point the buyer chose (46df-pochta), read off the
 * order's shipping method `data`, which the provider wrote from the carrier's
 * directory. The owner ships from the «Отправка» cabinet, so this is what the
 * owner copies there: the point's index and address. Renders nothing for any other
 * delivery.
 */
export const OrderPochtaPoint = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()
  const data = (order.shipping_methods ?? [])
    .map((method) => method.data as PochtaData | null | undefined)
    .find((entry) => entry?.provider === "pochta" && entry.pochta_point_index)

  if (!data?.pochta_point_index) {
    return null
  }

  const place = [data.pochta_point_city, data.pochta_point_region].filter(Boolean).join(", ")

  return (
    <div className="grid grid-cols-2 items-start px-6 py-4" data-testid="order-pochta-point">
      <Text size="small" leading="compact" weight="plus">
        {t("integrations.pochta.orderHeading")}
      </Text>
      <div className="flex flex-col gap-y-0.5">
        <Text size="small" leading="compact" data-testid="order-pochta-point-index">
          {t("integrations.pochta.orderIndex", { index: data.pochta_point_index })}
        </Text>
        {data.pochta_point_address ? (
          <Text size="small" leading="compact">
            {data.pochta_point_address}
          </Text>
        ) : null}
        {place ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {place}
          </Text>
        ) : null}
        {data.pochta_point_name ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {data.pochta_point_name}
          </Text>
        ) : null}
        {data.term_label ? (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("integrations.pochta.orderTerm", { term: data.term_label })}
          </Text>
        ) : null}
        {data.tariff_source === "public-retail-estimate" ? (
          <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
            {t("integrations.pochta.orderEstimate")}
          </Text>
        ) : null}
      </div>
    </div>
  )
}
