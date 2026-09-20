import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MaskedSecret } from "../../../../hooks/api/payment-settings"

/**
 * «задано ····1234» / «не задано» for one stored password
 * (t03-tenant-secrets-robokassa).
 *
 * Its own file since p01 split the Robokassa form across two screens: the badge
 * is rendered by the credentials fields on `/settings/integrations/robokassa`,
 * and a component defined inside the old page file would have travelled with
 * only one of the halves.
 */
export const SecretStatus = ({ masked }: { masked: MaskedSecret | undefined }) => {
  const { t } = useTranslation()
  if (!masked || !masked.set) {
    return (
      <Badge size="2xsmall" color="grey">
        {t("paymentSettings.secretNotSet")}
      </Badge>
    )
  }
  return (
    <Badge size="2xsmall" color="green">
      {t("paymentSettings.secretSet", { last4: masked.last4 ?? "" })}
    </Badge>
  )
}
