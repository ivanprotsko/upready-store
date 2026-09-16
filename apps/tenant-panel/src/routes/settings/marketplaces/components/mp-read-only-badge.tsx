import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * Whether this shop's marketplace key is marked read-only
 * (w12-marketplace-core, generalised from `wb-read-only-badge`).
 *
 * FOUR states, not two. «не спрошено» is the state before the answer arrives
 * and is different from «не удалось определить»: one of them is a question
 * still in flight, the other is a question that came back without an answer,
 * and showing the first as the second would be a claim we cannot back
 * (rule 19h). Neither is ever shown as «только чтение».
 *
 * Whatever this says, no adapter can write: the transports only send the reads
 * their registries hold.
 */
export const MpReadOnlyBadge = ({
  value,
}: {
  value: boolean | "unknown" | "pending"
}) => {
  const { t } = useTranslation()

  if (value === true) {
    return <Badge color="green">{t("marketplaces.readOnly.yes")}</Badge>
  }
  if (value === false) {
    return <Badge color="orange">{t("marketplaces.readOnly.no")}</Badge>
  }
  if (value === "pending") {
    return <Badge color="grey">{t("marketplaces.readOnly.asking")}</Badge>
  }
  return <Badge color="grey">{t("marketplaces.readOnly.unknown")}</Badge>
}
