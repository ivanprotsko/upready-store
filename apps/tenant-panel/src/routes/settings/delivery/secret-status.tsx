import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MaskedSecret } from "../../../hooks/api/delivery-settings"

/**
 * «задано ····1234» or «не задано» for one stored password
 * (i02-apiship-cdek-shipping). The backend never returns a secret, only this
 * mask, so the badge is the whole truth the owner gets about what is saved.
 */
export const SecretStatus = ({ masked }: { masked: MaskedSecret | undefined }) => {
  const { t } = useTranslation()

  if (!masked || !masked.set) {
    return (
      <Badge size="2xsmall" color="grey">
        {t("deliverySettings.secretNotSet")}
      </Badge>
    )
  }

  return (
    <Badge size="2xsmall" color="green">
      {t("deliverySettings.secretSet", { last4: masked.last4 ?? "" })}
    </Badge>
  )
}
