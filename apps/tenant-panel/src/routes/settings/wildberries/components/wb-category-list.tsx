import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbStatusResponse } from "../../../../hooks/api/wb-status"

/**
 * Every documented WB access category, granted and denied alike
 * (w13-wb-readonly-flag).
 *
 * A set bit the doc table does not name is still shown, as "unknown bit N",
 * rather than dropped: `bits` carries every set bit and `categories` carries
 * every named one, so the difference between the two is exactly the unnamed
 * bits the owner should know their key sets.
 */
export const WbCategoryList = ({
  categories,
  bits,
}: {
  categories: WbStatusResponse["token"]["categories"]
  bits: WbStatusResponse["token"]["bits"]
}) => {
  const { t } = useTranslation()
  const unnamed = bits.filter((bit) => bit.meaning === null)

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Badge key={category.bit} color={category.granted ? "green" : "grey"} size="2xsmall">
            {category.name}
            {category.granted
              ? ` — ${t("wildberries.categories.granted")}`
              : ` — ${t("wildberries.categories.denied")}`}
          </Badge>
        ))}
        {unnamed.map((bit) => (
          <Badge key={bit.bit} color="orange" size="2xsmall">
            {t("wildberries.categories.unknownBit", { bit: bit.bit })}
          </Badge>
        ))}
      </div>
    </div>
  )
}
