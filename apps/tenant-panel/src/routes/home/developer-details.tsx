import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDownMini, ChevronRightMini } from "@medusajs/icons"
import { Button, Text } from "@medusajs/ui"
import { PublishableKey } from "./publishable-key"

type Tenant = {
  handle: string
  sales_channel: { id: string; name: string; is_disabled: boolean } | null
  api_key: { id: string; token: string; redacted: string; title: string; type: string } | null
}

// f15-overview-empty: the handle, sales channel name and publishable key are
// technical values a shop owner does not recognize and should not be invited
// to paste anywhere from the first screen (found by q02-qa-owner). They move
// here, collapsed by default, instead of onto /settings — nothing else in
// the panel currently owns them.
export const DeveloperDetails = ({ tenant }: { tenant: Tenant | undefined }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!tenant) {
    return null
  }

  return (
    <div className="border-t pt-4">
      <Button
        variant="transparent"
        size="small"
        className="text-ui-fg-subtle px-0"
        onClick={() => setOpen((value) => !value)}
        data-testid="developer-details-toggle"
      >
        {open ? <ChevronDownMini /> : <ChevronRightMini />}
        {t("overview.developerDetails")}
      </Button>
      {open ? (
        <div className="flex flex-col gap-y-4 pt-4" data-testid="developer-details-body">
          <div className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              {t("fields.handle")}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {tenant.handle}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              {t("fields.salesChannel")}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {tenant.sales_channel?.name ?? "-"}
            </Text>
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" weight="plus">
              {t("apiKeyManagement.domain.publishable")}
            </Text>
            {tenant.api_key ? (
              <PublishableKey
                redacted={tenant.api_key.redacted}
                token={tenant.api_key.token}
              />
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                -
              </Text>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
