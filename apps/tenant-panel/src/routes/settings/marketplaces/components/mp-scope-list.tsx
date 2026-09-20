import { Badge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarketplaceScope } from "../../../../hooks/api/marketplaces"

/**
 * What the key may reach, as the key itself reports it (w12-marketplace-core,
 * generalised from `wb-category-list`).
 *
 * The two marketplaces answer differently and the screen says so rather than
 * flattening them: Wildberries lists every documented category with a granted
 * or denied mark, because its key carries the whole bitmask; Ozon answers with
 * the roles the key HAS, and a role it did not mention is not a denied role we
 * know about. So an empty list here means "the key told us nothing", never
 * "the key may do nothing".
 */
export const MpScopeList = ({ scopes }: { scopes: MarketplaceScope[] }) => {
  const { t } = useTranslation()

  if (!scopes.length) {
    return (
      <Text className="text-ui-fg-subtle" size="small">
        {t("marketplaces.scopes.none")}
      </Text>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {scopes.map((scope) => (
        <Badge key={scope.name} color={scope.granted ? "green" : "grey"} size="2xsmall">
          {scope.name}
          {scope.granted
            ? ` — ${t("marketplaces.scopes.granted")}`
            : ` — ${t("marketplaces.scopes.denied")}`}
        </Badge>
      ))}
    </div>
  )
}
