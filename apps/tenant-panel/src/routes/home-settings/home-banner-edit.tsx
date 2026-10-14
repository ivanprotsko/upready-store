import type { HttpTypes } from "@medusajs/types"
import { Label, RadioGroup, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Navigate, useParams } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../components/common/form"
import { Combobox } from "../../components/inputs/combobox"
import { SettingsEditDrawer } from "../../components/settings"
import { productsQueryKeys } from "../../hooks/api/products"
import { useComboboxData } from "../../hooks/use-combobox-data"
import { sdk } from "../../lib/client"
import { BannerCard } from "./components/banner-card"
import { ImageField } from "./components/image-field"
import { TextField } from "./components/text-field"
import {
  BANNERS_MAX,
  BANNER_ALT_MAX,
  BANNER_TEXT_MAX,
  isAllowedBannerHref,
  type HomeBanner,
} from "./composition"
import { useHomeDocument, useUploadGate } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-banner-edit`):
// the drawer of one banner of the storefront's HeroSliders block
// (t-2026-09-24-n15) — its picture, the picture's description, the four corner
// texts, what the whole card opens (a product of the shop or a link) and the
// card as the buyer will see it. It replaces the eight open fields per banner
// of the old form. Routes: `banners/create` (a new banner, last in the list,
// «Добавить») and `banners/:bannerId/edit` under `/home-settings`. The checks
// are the backend's (`HomeBannerSchema`): a picture, a link that starts with
// http(s):// or /, a product picked; the drawer sends the document with this
// banner in its place, or last when it is new.

const LINK_TYPES = ["product", "url"] as const

type BannerValues = {
  image_src: string
  alt: string
  kicker: string
  label: string
  title: string
  button: string
  link_type: (typeof LINK_TYPES)[number]
  product_id: string
  href: string
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `b_${crypto.randomUUID().slice(0, 8)}`
    : `b_${Date.now().toString(36)}`

const valuesOf = (banner?: HomeBanner): BannerValues => ({
  image_src: banner?.image.src ?? "",
  alt: banner?.image.alt ?? "",
  kicker: banner?.kicker ?? "",
  label: banner?.label ?? "",
  title: banner?.title ?? "",
  button: banner?.button ?? "",
  link_type: banner?.link.type ?? "product",
  product_id: banner?.link.type === "product" ? banner.link.product_id : "",
  href: banner?.link.type === "url" ? banner.link.href : "",
})

/** The banner the values describe; a stored one keeps its id, place and other languages. */
const bannerOf = (values: BannerValues, stored: HomeBanner | undefined, sort: number): HomeBanner => ({
  ...stored,
  id: stored?.id ?? newId(),
  // A new picture drops the sizes and `srcset` the old one was cut with.
  image:
    stored && stored.image.src === values.image_src
      ? { ...stored.image, alt: values.alt }
      : { src: values.image_src, alt: values.alt },
  kicker: values.kicker,
  label: values.label,
  title: values.title,
  button: values.button,
  link:
    values.link_type === "product"
      ? {
          type: "product",
          product_id: values.product_id,
          // The platform re-reads the handle of the product at save time.
          handle:
            stored?.link.type === "product" && stored.link.product_id === values.product_id
              ? stored.link.handle
              : "",
        }
      : { type: "url", href: values.href.trim() },
  sort,
})

const BannerDrawer = ({
  stored,
  number,
  save,
}: {
  stored?: HomeBanner
  number: number
  save: (values: BannerValues) => Promise<unknown>
}) => {
  const { t } = useTranslation()
  const uploads = useUploadGate()

  const products = useComboboxData({
    queryKey: productsQueryKeys.list({ fields: "id,title,handle", limit: 20 }),
    queryFn: (params) =>
      sdk.client.fetch<HttpTypes.AdminProductListResponse>("/tenants/products", {
        query: { ...params, fields: "id,title,handle" },
      }),
    getOptions: (data) => data.products.map((product) => ({ label: product.title, value: product.id })),
    defaultValue: stored?.link.type === "product" ? stored.link.product_id : undefined,
  })

  const text = zod.string().max(BANNER_TEXT_MAX)
  const schema = zod
    .object({
      image_src: zod.string().min(1, t("homeSettings.banners.imageRequired")),
      alt: zod.string().max(BANNER_ALT_MAX),
      kicker: text,
      label: text,
      title: text,
      button: text,
      link_type: zod.enum(LINK_TYPES),
      product_id: zod.string(),
      href: zod.string().max(1000),
    })
    .superRefine((values, ctx) => {
      if (values.link_type === "product" && !values.product_id) {
        ctx.addIssue({ code: "custom", path: ["product_id"], message: t("homeSettings.banners.errorProduct") })
      }
      if (values.link_type === "url" && !isAllowedBannerHref(values.href.trim())) {
        ctx.addIssue({ code: "custom", path: ["href"], message: t("homeSettings.banners.errorHref") })
      }
    })

  return (
    <SettingsEditDrawer<BannerValues>
      title={stored ? t("homeSettings.banners.editTitle", { n: number }) : t("homeSettings.banners.createTitle")}
      description={t("homeSettings.banners.drawerSubtitle")}
      schema={schema}
      defaultValues={valuesOf(stored)}
      onSubmit={uploads.guard(save)}
      successMessage={stored ? t("homeSettings.banners.saved") : t("homeSettings.banners.added")}
      submitText={stored ? undefined : t("actions.add")}
    >
      {(form) => {
        const live = form.watch()

        return (
          <>
            <ImageField
              control={form.control}
              name="image_src"
              label={t("homeSettings.banners.image")}
              removable={false}
              zoneHint={t("homeSettings.banners.imageZone")}
              onUploadingChange={uploads.track}
            />
            <TextField
              control={form.control}
              name="alt"
              label={t("homeSettings.banners.alt")}
              hint={t("homeSettings.banners.altHint")}
              optional
              maxLength={BANNER_ALT_MAX}
              testId="home-banner-alt"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="kicker"
                label={t("homeSettings.banners.kicker")}
                optional
                maxLength={BANNER_TEXT_MAX}
                testId="home-banner-kicker"
              />
              <TextField
                control={form.control}
                name="label"
                label={t("homeSettings.banners.label")}
                optional
                maxLength={BANNER_TEXT_MAX}
                testId="home-banner-label"
              />
              {/* The title is the card's two-line chip: the owner's own line break is kept. */}
              <TextField
                control={form.control}
                name="title"
                label={t("homeSettings.banners.cornerTitle")}
                hint={t("homeSettings.banners.cornerTitleHint")}
                optional
                rows={2}
                maxLength={BANNER_TEXT_MAX}
                testId="home-banner-title"
              />
              <TextField
                control={form.control}
                name="button"
                label={t("homeSettings.banners.button")}
                hint={t("homeSettings.banners.buttonHint")}
                optional
                maxLength={BANNER_TEXT_MAX}
                testId="home-banner-button"
              />
            </div>
            <Form.Field
              control={form.control}
              name="link_type"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("homeSettings.banners.linkType")}</Form.Label>
                  <Form.Control>
                    <RadioGroup
                      {...field}
                      ref={ref}
                      value={value}
                      onValueChange={onChange}
                      className="flex flex-wrap items-center gap-x-6 gap-y-2"
                    >
                      {LINK_TYPES.map((type) => (
                        <div key={type} className="flex items-center gap-x-2">
                          <RadioGroup.Item value={type} id={`home-banner-link-${type}`} />
                          <Label htmlFor={`home-banner-link-${type}`} size="small">
                            {type === "product"
                              ? t("homeSettings.banners.linkProduct")
                              : t("homeSettings.banners.linkUrl")}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            {live.link_type === "product" ? (
              <Form.Field
                control={form.control}
                name="product_id"
                render={({ field: { value, onChange, ...field } }) => (
                  <Form.Item>
                    <Form.Label>{t("homeSettings.banners.product")}</Form.Label>
                    <Form.Control>
                      <Combobox
                        {...field}
                        {...products}
                        value={value || undefined}
                        onChange={(next) => onChange((next as string | undefined) ?? "")}
                        placeholder={t("homeSettings.banners.productPlaceholder")}
                        data-testid="home-banner-product"
                      />
                    </Form.Control>
                    <Form.Hint>{t("homeSettings.banners.productHint")}</Form.Hint>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
            ) : (
              <TextField
                control={form.control}
                name="href"
                label={t("homeSettings.banners.href")}
                hint={t("homeSettings.banners.hrefHint")}
                placeholder="/store"
                maxLength={1000}
                testId="home-banner-href"
              />
            )}
            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">
                {t("homeSettings.banners.preview")}
              </Text>
              <BannerCard src={live.image_src} texts={live} />
            </div>
          </>
        )
      }}
    </SettingsEditDrawer>
  )
}

export const HomeBannerEdit = ({ create = false }: { create?: boolean }) => {
  const { bannerId } = useParams()
  const { doc, isPending, save } = useHomeDocument()

  if (isPending) {
    // The drawer opens once the document is read: a save must not drop the other banners.
    return null
  }

  const banners = doc.content.banners ?? []
  const index = create ? banners.length : banners.findIndex((banner) => banner.id === bannerId)
  const stored = create ? undefined : banners[index]

  // A banner that is gone, or a new one past the limit, leads back to the page.
  if ((!create && !stored) || (create && banners.length >= BANNERS_MAX)) {
    return <Navigate to="/home-settings" replace />
  }

  return (
    <BannerDrawer
      stored={stored}
      number={index + 1}
      save={(values) =>
        save((current) => {
          const list = current.content.banners ?? []
          const banner = bannerOf(values, stored, index)
          const next = stored ? list.map((item) => (item.id === stored.id ? banner : item)) : [...list, banner]
          return { ...current, content: { ...current.content, banners: next } }
        })
      }
    />
  )
}

export { HomeBannerEdit as Component }
