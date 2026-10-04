import { ArrowUpRightOnBox, Eye, Link as LinkIcon, PencilSquare, XMarkMini } from "@medusajs/icons"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../../components/common/action-menu"
import {
  MARKETPLACE_LABEL,
  slugOf,
  type MarketplaceId,
  type MpProductRow,
} from "../../../../hooks/api/marketplace-section"
import { useMpLinkActions } from "../use-link-actions"

/** What the menu needs of a card: a list row and the card page both have it. */
export type MpProductCardRef = Pick<MpProductRow, "id" | "marketplace" | "external_id" | "title" | "url" | "link">

/**
 * The row menu, also the «…» of the card page. «Открыть на Wildberries» opens
 * the buyer's page in a new tab: `ActionMenu`'s `to` is a router link, and an
 * absolute address there would replace the panel in the same tab.
 */
export const MpProductActions = ({
  row,
  marketplace,
  onLink,
  withOpenCard = true,
}: {
  row: MpProductCardRef
  marketplace: MarketplaceId
  onLink: () => void
  /** Off on the card page itself. */
  withOpenCard?: boolean
}) => {
  const { t } = useTranslation()
  const { unlinkCard } = useMpLinkActions()
  const label = MARKETPLACE_LABEL[marketplace]
  const url = row.url

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            ...(withOpenCard
              ? [
                  {
                    icon: <Eye />,
                    label: t("mp.products.actions.openCard"),
                    to: `/marketplaces/${slugOf(marketplace)}/products/${row.id}`,
                  },
                ]
              : []),
            ...(url
              ? [
                  {
                    icon: <ArrowUpRightOnBox />,
                    label: t("mp.products.actions.openOnMarketplace", { marketplace: label }),
                    onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
                  },
                ]
              : []),
            ...(row.link.product_id
              ? [
                  {
                    icon: <PencilSquare />,
                    label: t("mp.products.actions.openShopProduct"),
                    to: `/products/${row.link.product_id}`,
                  },
                ]
              : []),
          ],
        },
        {
          actions:
            row.link.state === "linked"
              ? [{ icon: <XMarkMini />, label: t("mp.products.actions.unlink"), onClick: () => unlinkCard(row) }]
              : [
                  {
                    icon: <LinkIcon />,
                    label:
                      row.link.state === "needs_choice"
                        ? t("mp.products.actions.choose")
                        : t("mp.products.actions.link"),
                    onClick: onLink,
                  },
                ],
        },
      ]}
    />
  )
}
