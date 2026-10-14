import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SettingsDetail, type SettingsRow, type SettingsSection } from "../../components/settings"
import { useProductCategory } from "../../hooks/api/categories"
import { useDate } from "../../hooks/use-date"
import { AddBannerButton, HomeBannersList } from "./components/home-banners-list"
import { BANNERS_MAX, BLOCK_SLOTS, HOME_BLOCKS, IMAGE_HEROES, heroShowsImage } from "./composition"
import { useHomeDocument } from "./use-home-edit"

// tenant-panel: own screen, no Admin counterpart (`/home-settings`). It reads
// the tenant's home-page document `upready.tenant-home/v1`
// (docs/tenant-panel/api-contract.md, "Piece 8"), which its own storefront
// reads through `GET /store/tenant/home`.
//
// t-2026-10-14-01 (panel redesign, G4, prototype state `home`): the page only
// reads (design-system rules 1–2, Ivan 14.10: «почему не спрятали поля»). Six
// sections in the order the owner needs them — theme, blocks, first screen,
// banners, products, order — each with its one-phrase description and «…» →
// «Изменить», which opens the section's drawer on its nested route
// (`theme/edit`, `blocks/edit`, `hero/edit`, `banners/create`,
// `banners/:bannerId/edit`, `products/edit`, `order/edit`). There is no
// «Сохранить» on the page any more; each drawer saves the document with its own
// part changed and says so in one toast.

export const HomeSettings = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { doc, saved, isPending, save } = useHomeDocument()

  const { settings, content } = doc
  const banners = content.banners ?? []
  const products = content.products
  const categoryId = products.source === "category" ? products.category_id : ""
  const { product_category: category } = useProductCategory(
    categoryId,
    { fields: "id,name" },
    { enabled: !!categoryId }
  )

  const option = (slot: string, value: string) => t(`homeSettings.options.${slot}.${value}`)
  const why = (slot: string, value: string) => t(`homeSettings.why.${slot}.${value}`)

  const savedLine = saved?.updatedAt
    ? t("homeSettings.savedAt", { time: getFullDate({ date: saved.updatedAt, includeTime: true }) })
    : t("homeSettings.neverSaved")

  const heroImageHint = (): string | undefined => {
    if (!heroShowsImage(settings.hero)) {
      return t("homeSettings.hero.imageUnused", {
        variant: option("hero", settings.hero),
        list: IMAGE_HEROES.map((hero) => `«${option("hero", hero)}»`).join(", "),
      })
    }
    return content.hero.image_url ? undefined : t("homeSettings.hero.imageEmpty")
  }

  const hidden = HOME_BLOCKS.filter((block) => !content.order.includes(block))

  const sections: SettingsSection[] = [
    {
      // The first section carries the screen's own title (E11) and the time of the last save.
      id: "theme",
      title: t("homeSettings.title"),
      description: `${t("homeSettings.theme.subtitle")} ${savedLine}`,
      editTo: "theme/edit",
      rows: [
        {
          id: "palette",
          label: t("homeSettings.theme.palette"),
          value: t(`homeSettings.palettes.${doc.theme.preset}`),
        },
        {
          id: "defaultMode",
          label: t("homeSettings.slots.defaultMode"),
          value: option("defaultMode", settings.defaultMode),
          hint: why("defaultMode", settings.defaultMode),
        },
      ],
    },
    {
      id: "blocks",
      title: t("homeSettings.blocks.title"),
      description: t("homeSettings.blocks.subtitle"),
      editTo: "blocks/edit",
      rows: BLOCK_SLOTS.map(
        (slot): SettingsRow => ({
          id: slot,
          label: t(`homeSettings.slots.${slot}`),
          value: option(slot, settings[slot]),
          hint: why(slot, settings[slot]),
        })
      ),
    },
    {
      id: "hero",
      title: t("homeSettings.hero.title"),
      description: t("homeSettings.hero.subtitle"),
      editTo: "hero/edit",
      rows: [
        { id: "heroTitle", label: t("homeSettings.hero.heading"), value: content.hero.title },
        { id: "heroSubtitle", label: t("homeSettings.hero.subheading"), value: content.hero.subtitle },
        {
          id: "heroButton",
          label: t("homeSettings.hero.button"),
          value: content.hero.cta_label,
          hint: content.hero.cta_href
            ? t("homeSettings.hero.leadsTo", { href: content.hero.cta_href })
            : content.hero.cta_label
              ? t("homeSettings.hero.noLink")
              : undefined,
        },
        {
          id: "heroImage",
          label: t("homeSettings.hero.image"),
          value: content.hero.image_url ? (
            <img
              src={content.hero.image_url}
              alt=""
              className="h-12 w-[72px] rounded-md bg-ui-bg-subtle object-cover shadow-borders-base"
            />
          ) : null,
          hint: heroImageHint(),
        },
      ],
    },
    {
      id: "banners",
      title: t("homeSettings.banners.title"),
      description: t("homeSettings.banners.subtitle", { max: BANNERS_MAX }),
      // The section's only action is the owner's next step: a button, no «…» (E11).
      actions: [],
      action: banners.length ? <AddBannerButton count={banners.length} /> : undefined,
      rows: [],
      body: <HomeBannersList banners={banners} save={save} />,
    },
    {
      id: "products",
      title: t("homeSettings.products.title"),
      description: t("homeSettings.products.subtitle"),
      editTo: "products/edit",
      rows: [
        {
          id: "productsSource",
          label: t("homeSettings.products.source"),
          value:
            products.source === "category"
              ? t("homeSettings.products.sourceCategory")
              : t("homeSettings.products.sourcePopular"),
          hint:
            products.source === "category"
              ? t("homeSettings.products.sourceCategoryWhy")
              : t("homeSettings.products.sourcePopularWhy"),
        },
        ...(products.source === "category"
          ? [{ id: "productsCategory", label: t("homeSettings.products.category"), value: category?.name ?? "" }]
          : []),
        {
          id: "productsTitle",
          label: t("homeSettings.products.heading"),
          value: products.source === "category" ? products.title : "",
          hint:
            products.source === "category"
              ? products.title
                ? undefined
                : t("homeSettings.products.headingEmpty")
              : t("homeSettings.products.headingOnlyCategory"),
        },
      ],
    },
    {
      id: "order",
      title: t("homeSettings.order.title"),
      description: t("homeSettings.order.subtitle"),
      editTo: "order/edit",
      rows: [],
      body: (
        <div className="divide-y" data-testid="home-order">
          {content.order.map((block, index) => (
            <div key={block} className="flex items-center gap-x-4 px-6 py-3" data-testid={`home-order-${block}`}>
              <Text size="small" leading="compact" className="w-6 shrink-0 text-right tabular-nums text-ui-fg-subtle">
                {index + 1}
              </Text>
              <Text size="small" leading="compact" weight="plus">
                {t(`homeSettings.order.blocks.${block}`)}
              </Text>
            </div>
          ))}
          <div className="px-6 py-3">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {hidden.length
                ? t("homeSettings.order.hiddenLine", {
                    list: hidden.map((block) => t(`homeSettings.order.blocks.${block}`)).join(", "),
                  })
                : t("homeSettings.order.hiddenNone")}
            </Text>
          </div>
        </div>
      ),
    },
  ]

  return <SettingsDetail isPending={isPending} sections={sections} />
}
