import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useLinkMarketplaceCard, useUnlinkMarketplaceCard } from "../../../hooks/api/marketplace-catalog"
import {
  MP_FIXTURES,
  marketplaceSectionQueryKeys,
  type MpProductRow,
} from "../../../hooks/api/marketplace-section"

type LinkedCard = Pick<MpProductRow, "id" | "marketplace" | "external_id" | "title" | "link">

/**
 * «Связать» and «Отвязать» of one card, for the row menu, the drawer and the
 * card page alike. Both go through the w14 routes (`POST /tenants/marketplaces/
 * catalog/links`, `DELETE …/links/:id`), which write `mp_link` and nothing on
 * the marketplace; a manual link is `matched_by = manual` and no import
 * rewrites it (`planLinkWrites`).
 *
 * The w14 hooks refresh the old catalog's keys only, so the marketplace
 * section's lists and this card are refetched here: the row's «Связь с
 * магазином» changes under the owner's click, and «Цены и остатки» picks the
 * shop's side up on its next look.
 */
export const useMpLinkActions = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { mutateAsync: link, isPending: isLinking } = useLinkMarketplaceCard()
  const { mutateAsync: unlink, isPending: isUnlinking } = useUnlinkMarketplaceCard()

  const refresh = (card: LinkedCard) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: marketplaceSectionQueryKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: [...marketplaceSectionQueryKeys.details(), card.id] }),
    ])

  const name = (card: LinkedCard) => card.title ?? card.external_id

  /** Resolves `true` when the link was written, so the drawer knows to close. */
  const linkTo = async (card: LinkedCard, variantId: string): Promise<boolean> => {
    try {
      if (!MP_FIXTURES) {
        await link({ marketplace: card.marketplace, external_id: card.external_id, variant_id: variantId })
        await refresh(card)
      }
      toast.success(t("mp.products.toasts.linked", { title: name(card) }))
      return true
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
      return false
    }
  }

  const unlinkCard = async (card: LinkedCard) => {
    try {
      if (!MP_FIXTURES) {
        if (!card.link.id) {
          return
        }
        await unlink(card.link.id)
        await refresh(card)
      }
      toast.success(t("mp.products.toasts.unlinked", { title: name(card) }))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return { linkTo, unlinkCard, isLinking, isUnlinking }
}
