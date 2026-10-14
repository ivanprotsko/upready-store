import { ArrowDownMini, ArrowUpMini, EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { Button, IconButton, Text, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu, type ActionGroup } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { useProducts } from "../../../hooks/api/products"
import { BANNERS_MAX, type HomeBanner, type TenantHomeDocument } from "../composition"
import { BannerCard } from "./banner-card"

// t-2026-10-14-01 (panel redesign, G4): the «Баннеры» section of the home page
// reads, it does not edit. A row is the banner's number, its thumbnail with the
// four corner texts, its title and what it opens; the row opens the banner's
// drawer (`banners/:bannerId/edit`), and «…» moves it or removes it — a move or
// a removal is one save of the document with the list changed, a removal only
// after `usePrompt` (rule 8). «Добавить баннер» stands in the header while
// there are banners; with none the body is `NoRecords` with the same button.

/** The banner's own words for a row: its title, else its first corner text. */
export const bannerName = (banner: HomeBanner): string =>
  [banner.title, banner.kicker, banner.label, banner.button]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .find(Boolean) ?? ""

export const moveBanner = (banners: HomeBanner[], index: number, delta: number): HomeBanner[] => {
  const target = index + delta
  if (target < 0 || target >= banners.length) {
    return banners
  }
  const next = [...banners]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next.map((banner, sort) => ({ ...banner, sort }))
}

export const AddBannerButton = ({ count }: { count: number }) => {
  const { t } = useTranslation()

  return count >= BANNERS_MAX ? (
    <Button size="small" variant="secondary" disabled>
      {t("homeSettings.banners.add")}
    </Button>
  ) : (
    <Button size="small" variant="secondary" asChild>
      <Link to="banners/create" data-testid="home-banners-add">
        {t("homeSettings.banners.add")}
      </Link>
    </Button>
  )
}

export const HomeBannersList = ({
  banners,
  save,
}: {
  banners: HomeBanner[]
  save: (edit: (doc: TenantHomeDocument) => TenantHomeDocument) => Promise<unknown>
}) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const [isSaving, setIsSaving] = useState(false)

  // The title of every product a banner opens, in one request.
  const productIds = banners.flatMap((banner) => (banner.link.type === "product" ? [banner.link.product_id] : []))
  const { products } = useProducts(
    { id: productIds, fields: "id,title", limit: BANNERS_MAX },
    { enabled: productIds.length > 0 }
  )
  const titleOf = new Map((products ?? []).map((product) => [product.id, product.title]))

  const saveList = async (next: HomeBanner[], success: string) => {
    setIsSaving(true)
    try {
      await save((doc) => ({ ...doc, content: { ...doc.content, banners: next } }))
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("general.error"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async (index: number) => {
    const banner = banners[index]
    const confirmed = await prompt({
      title: t("homeSettings.banners.removeTitle"),
      description: t("homeSettings.banners.removeDescription", {
        name: bannerName(banner) || t("homeSettings.banners.untitled", { n: index + 1 }),
      }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (confirmed) {
      const rest = banners.filter((_, i) => i !== index).map((item, sort) => ({ ...item, sort }))
      await saveList(rest, t("homeSettings.banners.removed"))
    }
  }

  const opens = (banner: HomeBanner): string => {
    if (banner.link.type === "url") {
      return t("homeSettings.banners.opensLink", { href: banner.link.href })
    }
    const title = titleOf.get(banner.link.product_id) ?? banner.link.handle
    return title
      ? t("homeSettings.banners.opensProduct", { title })
      : t("homeSettings.banners.opensProductUnknown")
  }

  const editTo = (banner: HomeBanner) => `banners/${encodeURIComponent(banner.id)}/edit`

  const rowActions = (banner: HomeBanner, index: number): ActionGroup[] => [
    {
      actions: [{ label: t("actions.change"), to: editTo(banner), icon: <PencilSquare /> }],
    },
    {
      actions: [
        {
          label: t("homeSettings.banners.moveUp"),
          onClick: () => void saveList(moveBanner(banners, index, -1), t("homeSettings.banners.moved")),
          icon: <ArrowUpMini />,
          disabled: isSaving || index === 0,
        },
        {
          label: t("homeSettings.banners.moveDown"),
          onClick: () => void saveList(moveBanner(banners, index, 1), t("homeSettings.banners.moved")),
          icon: <ArrowDownMini />,
          disabled: isSaving || index === banners.length - 1,
        },
      ],
    },
    {
      actions: [
        {
          label: t("actions.delete"),
          onClick: () => void handleRemove(index),
          icon: <Trash />,
          disabled: isSaving,
          destructive: true,
        },
      ],
    },
  ]

  if (!banners.length) {
    return (
      <div className="px-6 pb-8" data-testid="home-banners-empty">
        <NoRecords
          title={t("homeSettings.banners.emptyTitle")}
          message={t("homeSettings.banners.emptyMessage")}
          action={{ to: "banners/create", label: t("homeSettings.banners.add") }}
          className="h-auto pt-8"
        />
      </div>
    )
  }

  return (
    <>
      {banners.map((banner, index) => (
        <div
          key={banner.id}
          className="hover:bg-ui-bg-base-hover transition-fg flex items-center gap-x-4 px-6 py-3"
          data-testid="home-banner-row"
          data-banner-id={banner.id}
        >
          {/* The row opens its drawer (rule 9); «…» stays outside the link. */}
          <Link
            to={editTo(banner)}
            className="focus-visible:shadow-borders-focus flex min-w-0 flex-1 items-center gap-x-4 rounded-md outline-none"
          >
            <Text size="small" leading="compact" className="w-6 shrink-0 text-right tabular-nums text-ui-fg-subtle">
              {index + 1}
            </Text>
            <BannerCard src={banner.image.src} texts={banner} compact />
            <div className="flex min-w-0 flex-1 flex-col">
              <Text size="small" leading="compact" weight="plus" className="truncate">
                {bannerName(banner) || t("homeSettings.banners.untitled", { n: index + 1 })}
              </Text>
              <Text size="small" leading="compact" className="truncate text-ui-fg-subtle">
                {opens(banner)}
              </Text>
            </div>
          </Link>
          <ActionMenu groups={rowActions(banner, index)}>
            <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
              <EllipsisHorizontal />
            </IconButton>
          </ActionMenu>
        </div>
      ))}
    </>
  )
}
