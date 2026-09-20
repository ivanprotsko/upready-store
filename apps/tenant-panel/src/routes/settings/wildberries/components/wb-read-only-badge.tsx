import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * Whether the shop's Wildberries key is marked read-only
 * (w01-wb-readonly-client).
 *
 * Three states, not two. An unreadable key is "unknown" and must never be
 * shown as "read only": the claim comes from bit 30 of the key's own mask,
 * read against WB's documented bit table, and where there is no mask there is
 * no claim to make (rule 17a).
 *
 * Whatever this says, the client still cannot write to Wildberries: the
 * transport only sends the reads registered in
 * apps/backend/src/modules/wb/endpoints.ts.
 */
export const WbReadOnlyBadge = ({ value }: { value: boolean | "unknown" }) => {
  const { t } = useTranslation()

  if (value === true) {
    return <Badge color="green">{t("wildberries.readOnly.yes")}</Badge>
  }
  if (value === false) {
    return <Badge color="orange">{t("wildberries.readOnly.no")}</Badge>
  }
  return <Badge color="grey">{t("wildberries.readOnly.unknown")}</Badge>
}
