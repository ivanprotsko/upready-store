import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, IconButton, Input, Label, Select, Text, Textarea } from "@medusajs/ui"
import { ArrowDownMini, ArrowUpMini, Trash } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"

import { Combobox } from "../../../components/inputs/combobox"
import { useComboboxData } from "../../../hooks/use-combobox-data"
import { productsQueryKeys } from "../../../hooks/api/products"
import { sdk } from "../../../lib/client"
import {
  BANNERS_MAX,
  BANNER_TEXT_MAX,
  isAllowedBannerHref,
  type HomeBanner,
} from "../composition"

// tenant-panel: own component, no Admin counterpart. The «Баннеры на главной»
// section of /home-settings (t-2026-09-24-n15): the list of banners the
// storefront's HeroSliders block shows, each a picture with four corner texts
// and one link (a product of the shop or a URL). Add / remove / reorder, the
// picture through the same `POST /tenants/uploads` the hero image uses (passed
// in as `upload`), a live preview card drawn the way the storefront draws it
// (Figma 238:17551: kicker top-left, label top-right, title bottom-left, button
// bottom-right). Saving is the screen's own Save: the banners ride inside
// `content.banners` of the home document.

type Props = {
  banners: HomeBanner[]
  onChange: (banners: HomeBanner[]) => void
  upload: (file: File) => Promise<string | undefined>
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `b_${crypto.randomUUID().slice(0, 8)}`
    : `b_${Date.now().toString(36)}`

export const emptyBanner = (sort: number): HomeBanner => ({
  id: newId(),
  image: { src: "", alt: "" },
  kicker: "",
  label: "",
  title: "",
  button: "",
  link: { type: "url", href: "" },
  sort,
})

/** The client-side twin of the backend's checks, so a bad URL is named next to
 *  its field before the PUT is even sent. Returns a message per banner id. */
export const validateBanners = (
  banners: HomeBanner[],
  t: (key: string, options: { defaultValue: string }) => string
): Record<string, string> => {
  const errors: Record<string, string> = {}
  for (const banner of banners) {
    if (!banner.image.src) {
      errors[banner.id] = t("homeSettings.banners.errorImage", {
        defaultValue: "Add a picture.",
      })
    } else if (banner.link.type === "url" && !isAllowedBannerHref(banner.link.href)) {
      errors[banner.id] = t("homeSettings.banners.errorHref", {
        defaultValue: "The link must start with http(s):// or with / for a page of this shop.",
      })
    } else if (banner.link.type === "product" && !banner.link.product_id) {
      errors[banner.id] = t("homeSettings.banners.errorProduct", {
        defaultValue: "Pick a product.",
      })
    }
  }
  return errors
}

export const HomeBannersEditor = ({ banners, onChange, upload }: Props) => {
  const { t } = useTranslation()
  const errors = validateBanners(banners, t)

  const patch = (id: string, changes: Partial<HomeBanner>) =>
    onChange(banners.map((b) => (b.id === id ? { ...b, ...changes } : b)))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= banners.length) return
    const next = [...banners]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((b, i) => ({ ...b, sort: i })))
  }

  const remove = (id: string) =>
    onChange(banners.filter((b) => b.id !== id).map((b, i) => ({ ...b, sort: i })))

  const add = () => onChange([...banners, emptyBanner(banners.length)])

  return (
    <div className="flex flex-col gap-y-4" data-testid="home-banners-editor">
      <Text size="small" className="text-ui-fg-subtle">
        {t("homeSettings.banners.hint", {
          defaultValue:
            "Each banner is one picture with up to four short texts in its corners; the whole banner opens the product or the link you pick. Up to {{max}} banners, shown in this order.",
          max: BANNERS_MAX,
        })}
      </Text>

      {banners.length === 0 ? (
        <Text size="small" className="text-ui-fg-muted" data-testid="home-banners-empty">
          {t("homeSettings.banners.empty", {
            defaultValue: "No banners yet — the storefront shows the shop's courses instead.",
          })}
        </Text>
      ) : null}

      {banners.map((banner, index) => (
        <BannerRow
          key={banner.id}
          banner={banner}
          index={index}
          total={banners.length}
          error={errors[banner.id]}
          onPatch={(changes) => patch(banner.id, changes)}
          onMove={(delta) => move(index, delta)}
          onRemove={() => remove(banner.id)}
          upload={upload}
        />
      ))}

      <div>
        <Button
          variant="secondary"
          size="small"
          onClick={add}
          disabled={banners.length >= BANNERS_MAX}
          data-testid="home-banners-add"
        >
          {t("homeSettings.banners.add", { defaultValue: "Add banner" })}
        </Button>
      </div>
    </div>
  )
}

type RowProps = {
  banner: HomeBanner
  index: number
  total: number
  error?: string
  onPatch: (changes: Partial<HomeBanner>) => void
  onMove: (delta: number) => void
  onRemove: () => void
  upload: (file: File) => Promise<string | undefined>
}

const BannerRow = ({ banner, index, total, error, onPatch, onMove, onRemove, upload }: RowProps) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)

  const products = useComboboxData({
    queryKey: productsQueryKeys.list({ fields: "id,title,handle", limit: 20 }),
    queryFn: (params) =>
      sdk.client.fetch<HttpTypes.AdminProductListResponse>("/tenants/products", {
        query: { ...params, fields: "id,title,handle" },
      }),
    getOptions: (data) =>
      data.products.map((product) => ({
        label: product.title,
        value: product.id,
      })),
    defaultValue: banner.link.type === "product" ? banner.link.product_id : undefined,
  })

  const onUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await upload(file)
      if (url) {
        onPatch({ image: { src: url, alt: banner.image.alt } })
      }
    } finally {
      setUploading(false)
    }
  }

  const textField = (
    key: "kicker" | "label" | "title" | "button",
    label: string
  ) => (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus" htmlFor={`banner-${banner.id}-${key}`}>
        {label}
      </Label>
      {/* The title is the node's two-line chip: the owner's own line break is kept. */}
      {key === "title" ? (
        <Textarea
          id={`banner-${banner.id}-${key}`}
          data-testid={`banner-${key}`}
          maxLength={BANNER_TEXT_MAX}
          rows={2}
          value={banner[key]}
          onChange={(e) => onPatch({ [key]: e.target.value })}
        />
      ) : (
        <Input
          id={`banner-${banner.id}-${key}`}
          data-testid={`banner-${key}`}
          maxLength={BANNER_TEXT_MAX}
          value={banner[key]}
          onChange={(e) => onPatch({ [key]: e.target.value })}
        />
      )}
    </div>
  )

  return (
    <div
      className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base p-4"
      data-testid="home-banner-row"
      data-banner-id={banner.id}
    >
      <div className="flex items-center justify-between gap-x-2">
        <Text size="small" weight="plus">
          {t("homeSettings.banners.rowTitle", {
            defaultValue: "Banner {{n}}",
            n: index + 1,
          })}
        </Text>
        <div className="flex items-center gap-x-1">
          <IconButton
            size="small"
            variant="transparent"
            aria-label={t("homeSettings.banners.moveUp", { defaultValue: "Move up" })}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            data-testid="banner-move-up"
          >
            <ArrowUpMini />
          </IconButton>
          <IconButton
            size="small"
            variant="transparent"
            aria-label={t("homeSettings.banners.moveDown", { defaultValue: "Move down" })}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            data-testid="banner-move-down"
          >
            <ArrowDownMini />
          </IconButton>
          <IconButton
            size="small"
            variant="transparent"
            aria-label={t("homeSettings.banners.remove", { defaultValue: "Remove banner" })}
            onClick={onRemove}
            data-testid="banner-remove"
          >
            <Trash />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus" htmlFor={`banner-${banner.id}-image`}>
              {t("homeSettings.banners.image", { defaultValue: "Picture address" })}
            </Label>
            <div className="flex items-center gap-x-2">
              <Input
                id={`banner-${banner.id}-image`}
                data-testid="banner-image"
                value={banner.image.src}
                onChange={(e) =>
                  onPatch({ image: { src: e.target.value, alt: banner.image.alt } })
                }
              />
              <label className="shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="banner-image-upload"
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
                <span className="txt-compact-small-plus inline-flex h-8 cursor-pointer items-center rounded-md border border-ui-border-base px-3 text-ui-fg-subtle hover:bg-ui-bg-base-hover">
                  {uploading
                    ? t("homeSettings.uploading", { defaultValue: "Uploading…" })
                    : t("homeSettings.upload", { defaultValue: "Upload" })}
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus" htmlFor={`banner-${banner.id}-alt`}>
              {t("homeSettings.banners.alt", { defaultValue: "Picture description (alt)" })}
            </Label>
            <Input
              id={`banner-${banner.id}-alt`}
              data-testid="banner-alt"
              maxLength={200}
              value={banner.image.alt}
              onChange={(e) => onPatch({ image: { ...banner.image, alt: e.target.value } })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {textField("kicker", t("homeSettings.banners.kicker", { defaultValue: "Top left" }))}
            {textField("label", t("homeSettings.banners.label", { defaultValue: "Top right" }))}
            {textField("title", t("homeSettings.banners.title", { defaultValue: "Bottom left (title)" }))}
            {textField("button", t("homeSettings.banners.button", { defaultValue: "Bottom right (button)" }))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus">
                {t("homeSettings.banners.linkType", { defaultValue: "Opens" })}
              </Label>
              <Select
                value={banner.link.type}
                onValueChange={(value) =>
                  onPatch({
                    link:
                      value === "product"
                        ? { type: "product", product_id: "", handle: "" }
                        : { type: "url", href: "" },
                  })
                }
              >
                <Select.Trigger data-testid="banner-link-type">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="product">
                    {t("homeSettings.banners.linkProduct", { defaultValue: "Product" })}
                  </Select.Item>
                  <Select.Item value="url">
                    {t("homeSettings.banners.linkUrl", { defaultValue: "Link" })}
                  </Select.Item>
                </Select.Content>
              </Select>
            </div>
            {banner.link.type === "product" ? (
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("homeSettings.banners.product", { defaultValue: "Product" })}
                </Label>
                <Combobox
                  {...products}
                  value={banner.link.product_id || undefined}
                  onChange={(value) =>
                    onPatch({ link: { type: "product", product_id: value ?? "", handle: "" } })
                  }
                  placeholder={t("homeSettings.banners.productPlaceholder", {
                    defaultValue: "Find a product",
                  })}
                  data-testid="banner-product"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus" htmlFor={`banner-${banner.id}-href`}>
                  {t("homeSettings.banners.href", { defaultValue: "Address" })}
                </Label>
                <Input
                  id={`banner-${banner.id}-href`}
                  data-testid="banner-href"
                  placeholder="/ru/store"
                  value={banner.link.href}
                  onChange={(e) => onPatch({ link: { type: "url", href: e.target.value } })}
                />
              </div>
            )}
          </div>
          {error ? (
            <Text size="small" className="text-ui-fg-error" data-testid="banner-error">
              {error}
            </Text>
          ) : null}
        </div>

        <BannerPreview banner={banner} />
      </div>
    </div>
  )
}

/** The card as the storefront draws it (Figma 238:17551), at a smaller scale. */
const BannerPreview = ({ banner }: { banner: HomeBanner }) => {
  const { t } = useTranslation()
  const chip =
    "inline-flex rounded-[9px] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide leading-none"
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {t("homeSettings.banners.preview", { defaultValue: "Preview" })}
      </Label>
      <div
        className="relative aspect-[572/400] w-full max-w-[420px] overflow-hidden rounded-[24px] bg-ui-bg-subtle"
        data-testid="banner-preview"
      >
        {banner.image.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of a tenant upload; not a Next app.
          <img src={banner.image.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="pointer-events-none absolute inset-[3px] rounded-[21px] border-2 border-white" />
        {banner.kicker ? (
          <span className={`${chip} absolute left-4 top-4 bg-white text-[#1a1b09] ring-2 ring-white`}>
            {banner.kicker}
          </span>
        ) : null}
        {banner.label ? (
          <span className={`${chip} absolute right-4 top-4 bg-[#312721] text-white ring-2 ring-[#312721]`}>
            {banner.label}
          </span>
        ) : null}
        {banner.title ? (
          <span
            className={`${chip} absolute bottom-4 left-4 max-w-[45%] whitespace-pre-line rounded-[14px] bg-[#312721] px-3 py-2 text-[14px] leading-tight text-white ring-2 ring-[#312721]`}
          >
            {banner.title}
          </span>
        ) : null}
        {banner.button ? (
          <span className={`${chip} absolute bottom-4 right-4 bg-white text-[#1a1b09] ring-2 ring-white`}>
            {banner.button}
          </span>
        ) : null}
      </div>
    </div>
  )
}
