import { ArrowDownTray, ArrowPath } from "@medusajs/icons"
import { StatusBadge, Text, Tooltip, toast } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { ActionGroup } from "../../../../../components/common/action-menu"
import {
  type ApishipDocumentKind,
  downloadApishipFile,
  useApishipDocuments,
  useApishipStatusSync,
} from "../../../../../hooks/api/apiship"
import { useDate } from "../../../../../hooks/use-date"
import {
  apishipStatusColor,
  apishipStatusKey,
  isApishipFulfillment,
  isNotYetWithCarrier,
} from "../../../../../lib/apiship-status"
import { ExtendedOrder, ExtendedOrderFulfillment } from "../../constants"

// t-2026-10-14-58, part B: an ApiShip shipment on the order card — the order
// number in ApiShip, its status in words and colour with the carrier's own
// reason under a red one, where the parcel goes and by which tariff — and the
// three actions of its «…»: the label, the act, a fresh status. The carrier and
// the track number with its link stay in the section's own «Трек-номер» row:
// ApiShip writes them to `labels` and `metadata.carrier` (contract section 2).

type ApishipData = {
  provider_key?: string | null
  kind?: "courier" | "pickup" | null
  apiship_point_code?: string | null
  apiship_point_name?: string | null
  apiship_point_address?: string | null
  tariff_name?: string | null
  term_label?: string | null
  apiship_order_id?: number | null
  apiship_status?: string | null
  apiship_status_at?: string | null
  apiship_status_detail?: string | null
}

const dataOf = (fulfillment: ExtendedOrderFulfillment): ApishipData =>
  ((fulfillment as { data?: Record<string, unknown> | null }).data ?? {}) as ApishipData

// A carrier's status is long («Перевозчик не принял заказ»): in the half-width
// column of a phone it wraps inside the badge instead of running off the card.
const BADGE_WRAPS = "max-w-full items-start py-px leading-4"

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="text-ui-fg-subtle grid grid-cols-2 items-start px-6 py-4">
    <Text size="small" leading="compact" weight="plus">
      {label}
    </Text>
    <div className="flex min-w-0 flex-col items-start gap-y-1">{children}</div>
  </div>
)

export const ApishipShipmentRows = ({ fulfillment }: { fulfillment: ExtendedOrderFulfillment }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  if (!isApishipFulfillment(fulfillment)) {
    return null
  }

  const data = dataOf(fulfillment)
  const color = apishipStatusColor(data.apiship_status)
  const carrier =
    data.provider_key === "cdek" || data.provider_key === "rupost"
      ? t(`integrations.apiship.carrierLabel.${data.provider_key}`)
      : (data.provider_key ?? "")
  const tariff = [carrier, data.tariff_name, data.term_label].filter(Boolean).join(" · ")

  return (
    <>
      <Row label={t("apishipShipment.orderLabel")}>
        <Text size="small" leading="compact" data-testid="apiship-order-number">
          {data.apiship_order_id
            ? t("apishipShipment.orderNumber", { number: data.apiship_order_id })
            : t("apishipShipment.orderMissing")}
        </Text>
      </Row>
      <Row label={t("apishipShipment.statusLabel")}>
        {data.apiship_status ? (
          <Tooltip
            content={
              data.apiship_status_at
                ? getFullDate({ date: data.apiship_status_at, includeTime: true })
                : t("apishipShipment.statusLabel")
            }
          >
            <StatusBadge color={color} className={BADGE_WRAPS} data-testid="apiship-status">
              {t(apishipStatusKey(data.apiship_status))}
            </StatusBadge>
          </Tooltip>
        ) : (
          <StatusBadge color="blue" className={BADGE_WRAPS} data-testid="apiship-status">
            {t("apishipShipment.status.uploading")}
          </StatusBadge>
        )}
        {color === "red" && data.apiship_status_detail ? (
          <Text size="small" leading="compact" className="text-ui-fg-error" data-testid="apiship-status-detail">
            {data.apiship_status_detail}
          </Text>
        ) : null}
      </Row>
      <Row label={t("apishipShipment.destinationLabel")}>
        {data.kind === "pickup" ? (
          <>
            <Text size="small" leading="compact">
              {data.apiship_point_name ?? t("apishipShipment.pickupPoint")}
              {data.apiship_point_code ? ` (${data.apiship_point_code})` : ""}
            </Text>
            {data.apiship_point_address ? (
              <Text size="small" leading="compact">
                {data.apiship_point_address}
              </Text>
            ) : null}
          </>
        ) : (
          <Text size="small" leading="compact">
            {t("apishipShipment.courier")}
          </Text>
        )}
      </Row>
      {tariff ? (
        <Row label={t("apishipShipment.tariffLabel")}>
          <Text size="small" leading="compact">
            {tariff}
          </Text>
        </Row>
      ) : null}
    </>
  )
}

/**
 * The cancel of an ApiShip shipment says what it cancels and reads as
 * dangerous; any other fulfillment keeps the section's own words.
 */
export const useApishipCancelAction = (
  fulfillment: ExtendedOrderFulfillment
): { label?: string; destructive?: boolean } => {
  const { t } = useTranslation()
  return isApishipFulfillment(fulfillment)
    ? { label: t("apishipShipment.actions.cancel"), destructive: true }
    : {}
}

/** The «…» group of an ApiShip shipment; no group for any other fulfillment. */
export const useApishipShipmentActions = (
  order: ExtendedOrder,
  fulfillment: ExtendedOrderFulfillment
): ActionGroup[] => {
  const { t } = useTranslation()
  const { mutateAsync: fetchDocuments, isPending: isFetching } = useApishipDocuments()
  const { mutateAsync: syncStatus, isPending: isSyncing } = useApishipStatusSync()

  if (!isApishipFulfillment(fulfillment)) {
    return []
  }

  const data = dataOf(fulfillment)
  const closed = Boolean(fulfillment.canceled_at) || !data.apiship_order_id
  const busy = isFetching || isSyncing

  const handleDocument = async (kind: ApishipDocumentKind) => {
    try {
      const answer = await fetchDocuments({
        kind,
        order_ids: [order.id],
        fulfillment_ids: [fulfillment.id],
      })
      for (const file of answer.files) {
        const suffix = file.provider_key ? `-${file.provider_key}` : ""
        await downloadApishipFile(file.download, `apiship-${kind}-${order.display_id}${suffix}.pdf`)
      }
      const failed = answer.failed[0]
      if (failed) {
        toast.error(isNotYetWithCarrier(failed.message) ? t("apishipShipment.notYetWithCarrier") : failed.message)
      } else if (answer.files.length) {
        toast.success(t(`apishipShipment.toast.${kind}Ready`))
      } else {
        toast.error(t("apishipShipment.toast.noFile"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSync = async () => {
    try {
      const answer = await syncStatus({ order_ids: [order.id] })
      const mine = answer.results.find((result) => result.fulfillment_id === fulfillment.id)
      if (mine?.error) {
        toast.error(mine.error)
      } else if (mine?.changed) {
        toast.success(t("apishipShipment.toast.statusUpdated", { status: t(apishipStatusKey(mine.status)) }))
      } else {
        toast.info(t("apishipShipment.toast.statusSame"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return [
    {
      actions: [
        {
          label: t("apishipShipment.actions.label"),
          icon: <ArrowDownTray />,
          onClick: () => handleDocument("labels"),
          disabled: closed || busy,
        },
        {
          label: t("apishipShipment.actions.waybill"),
          icon: <ArrowDownTray />,
          onClick: () => handleDocument("waybills"),
          disabled: closed || busy,
        },
        {
          label: t("apishipShipment.actions.sync"),
          icon: <ArrowPath />,
          onClick: handleSync,
          disabled: closed || busy,
        },
      ],
    },
  ]
}
