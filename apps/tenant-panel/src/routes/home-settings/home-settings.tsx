import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { ArrowDownMini, ArrowUpMini, Spinner } from "@medusajs/icons"
import type { HttpTypes, AdminFile } from "@medusajs/types"

import { SingleColumnPage } from "../../components/layout/pages"
import { Combobox } from "../../components/inputs/combobox"
import { useComboboxData } from "../../hooks/use-combobox-data"
import { categoriesQueryKeys } from "../../hooks/api/categories"
import { useTenantHome, useUpdateTenantHome } from "../../hooks/api/home"
import { sdk } from "../../lib/client"
import {
  ModeImagePair,
  modeImagePairLabels,
} from "../../components/common/mode-image-pair"
import {
  BLOCK_LABELS,
  DEFAULT_DOCUMENT,
  FOOTER_OPTIONS,
  HEADER_OPTIONS,
  HERO_OPTIONS,
  HOME_BLOCKS,
  LISTING_OPTIONS,
  MODE_OPTIONS,
  THEME_LABELS,
  THEME_PRESETS,
  TILES_OPTIONS,
  blockedReason,
  type Option,
  type StorefrontSettingsInput,
  type TenantHomeDocument,
  type ThemePreset,
} from "./composition"

// tenant-panel: own screen, no Admin counterpart (`/home-settings`). It writes
// the tenant's home-page document `upready.tenant-home/v1`
// (docs/tenant-panel/api-contract.md, "Piece 8"), which its own storefront reads
// through `GET /store/tenant/home`. Built from the panel's own copied primitives
// — `SingleColumnPage`, `Container`, the `@medusajs/ui` form controls and the
// `Combobox` the Admin's organize forms use — rather than from a copied Admin
// screen, because the Admin has no equivalent document.
//
// Strings are `t(key, { defaultValue })`, the idiom the panel already uses for
// text the Admin's catalogs do not carry (`components/layout/main-layout`); the
// composition vocabulary itself lives in `composition.ts`, where every raw enum
// value is paired with the plain-language label and the one-line reason the
// storefront's own catalog carries for it (rule 18e).

/**
 * The multipart upload the panel already uses for product media, pointed at
 * `POST /tenants/uploads` (there is no `sdk.admin`-shaped wrapper for the tenant
 * namespace — the js-sdk hardcodes `/admin/...`).
 */
const uploadTenantFile = async (file: File): Promise<AdminFile | undefined> => {
  const form = new FormData()
  form.append("files", file)

  const { files } = await sdk.client.fetch<{ files: AdminFile[] }>(
    "/tenants/uploads",
    { method: "POST", headers: { "Content-Type": null }, body: form }
  )

  return files?.[0]
}

type SlotProps<T extends string> = {
  label: string
  value: T
  options: Option<T>[]
  /** Which slot of the composition document this select writes. */
  field: keyof StorefrontSettingsInput
  settings: StorefrontSettingsInput
  onChange: (value: T) => void
}

/**
 * One composition select. An option a FORBIDDEN pair blocks right now is
 * disabled and carries its reason under the select, the same way the
 * storefront's own composition popover greys it (`composition.ts` FORBIDDEN,
 * re-checked server-side — the panel never relies on the grey alone).
 */
const SlotSelect = <T extends string>({
  label,
  value,
  options,
  field,
  settings,
  onChange,
}: SlotProps<T>) => {
  const current = options.find((option) => option.value === value)
  const blocked = options
    .map((option) => ({ option, reason: blockedReason(settings, field, option.value) }))
    .filter((entry) => entry.reason)

  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus" htmlFor={`slot-${field}`}>
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <Select.Trigger id={`slot-${field}`} data-testid={`slot-${field}`}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {options.map((option) => {
            const reason = blockedReason(settings, field, option.value)
            return (
              <Select.Item key={option.value} value={option.value} disabled={!!reason}>
                {option.label}
              </Select.Item>
            )
          })}
        </Select.Content>
      </Select>
      {current ? (
        <Text size="small" className="text-ui-fg-subtle">
          {current.why}
        </Text>
      ) : null}
      {blocked.map((entry) => (
        <Text key={entry.option.value} size="small" className="text-ui-fg-muted">
          {`${entry.option.label} — ${entry.reason}`}
        </Text>
      ))}
    </div>
  )
}

export const HomeSettings = () => {
  const { t } = useTranslation()
  const { home, isPending, isError, error } = useTenantHome()
  const { mutateAsync, isPending: isSaving } = useUpdateTenantHome()

  const [doc, setDoc] = useState<TenantHomeDocument>(DEFAULT_DOCUMENT)
  // Three states, not two: "still loading" is not "nothing saved" (rule 19h).
  // `loaded` is what enables Save, and the initial load never overwrites a pick
  // the operator has already made while the request was in flight.
  const [loaded, setLoaded] = useState(false)
  // Which slot of the pair is uploading, if any: two upload buttons stand next to each
  // other and a shared boolean would spin both.
  const [uploading, setUploading] = useState<"light" | "dark" | null>(null)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (isPending || isError) {
      return
    }
    if (!touchedRef.current) {
      setDoc(home ?? DEFAULT_DOCUMENT)
    }
    setLoaded(true)
  }, [isPending, isError, home])

  const edit = (next: TenantHomeDocument) => {
    touchedRef.current = true
    setDoc(next)
  }

  const setSettings = (patch: Partial<StorefrontSettingsInput>) =>
    edit({ ...doc, settings: { ...doc.settings, ...patch } })

  const setHero = (patch: Partial<TenantHomeDocument["content"]["hero"]>) =>
    edit({ ...doc, content: { ...doc.content, hero: { ...doc.content.hero, ...patch } } })

  const categories = useComboboxData({
    queryKey: categoriesQueryKeys.lists(),
    queryFn: (params) =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryListResponse>(
        "/tenants/product-categories",
        { query: params }
      ),
    getOptions: (data) =>
      data.product_categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    defaultValue:
      doc.content.products.source === "category"
        ? doc.content.products.category_id
        : undefined,
  })

  const moveBlock = (index: number, delta: number) => {
    const order = [...doc.content.order]
    const target = index + delta
    if (target < 0 || target >= order.length) {
      return
    }
    ;[order[index], order[target]] = [order[target], order[index]]
    edit({ ...doc, content: { ...doc.content, order } })
  }

  const onUpload = async (file: File | undefined, slot: "light" | "dark") => {
    if (!file) {
      return
    }
    setUploading(slot)
    try {
      const uploaded = await uploadTenantFile(file)
      if (uploaded?.url) {
        setHero(slot === "dark" ? { image_url_dark: uploaded.url } : { image_url: uploaded.url })
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("homeSettings.uploadFailed", { defaultValue: "The image could not be uploaded." })
      )
    } finally {
      setUploading(null)
    }
  }

  const onSave = async () => {
    try {
      await mutateAsync({
        theme: doc.theme,
        settings: doc.settings,
        content: doc.content,
      })
      touchedRef.current = false
      toast.success(
        t("homeSettings.saved", { defaultValue: "The home page was saved." })
      )
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("homeSettings.saveFailed", { defaultValue: "The home page could not be saved." })
      )
    }
  }

  if (isError) {
    throw error
  }

  // `order` is what decides which blocks render at all: a block missing from it
  // is not shown on the storefront, so the screen lists the three in their saved
  // order first and the ones left out below them.
  const omitted = HOME_BLOCKS.filter((block) => !doc.content.order.includes(block))

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={home} hasOutlet={false}>
      <Container className="flex flex-col gap-y-8 p-6">
        <div className="flex items-start justify-between gap-x-4">
          <div>
            <Heading level="h1">
              {t("homeSettings.domain", { defaultValue: "Home page" })}
            </Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("homeSettings.hint", {
                defaultValue:
                  "What your storefront's home page shows: its theme, which version of each block, and the text inside them.",
              })}
            </Text>
            <Text size="small" className="text-ui-fg-muted">
              {doc.updatedAt
                ? t("homeSettings.savedAt", {
                    defaultValue: "Last saved {{time}}.",
                    time: new Date(doc.updatedAt).toLocaleString(),
                  })
                : t("homeSettings.neverSaved", {
                    defaultValue: "Not saved yet — these are the defaults.",
                  })}
            </Text>
          </div>
          <Button
            variant="primary"
            onClick={onSave}
            isLoading={isSaving}
            disabled={!loaded || isSaving}
            data-testid="home-settings-save"
          >
            {t("actions.save", { defaultValue: "Save" })}
          </Button>
        </div>

        {!loaded ? (
          <div className="flex items-center gap-x-2 text-ui-fg-subtle">
            <Spinner className="animate-spin" />
            <Text size="small">{t("general.loading", { defaultValue: "Loading" })}</Text>
          </div>
        ) : null}

        <div className="flex flex-col gap-y-4">
          <Heading level="h2">
            {t("homeSettings.theme", { defaultValue: "Theme" })}
          </Heading>
          <div className="flex flex-col gap-y-2 max-w-[420px]">
            <Label size="small" weight="plus" htmlFor="theme-preset">
              {t("homeSettings.themePreset", { defaultValue: "Colour preset" })}
            </Label>
            <Select
              value={doc.theme.preset}
              onValueChange={(next) => edit({ ...doc, theme: { preset: next as ThemePreset } })}
            >
              <Select.Trigger id="theme-preset" data-testid="theme-preset">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {THEME_PRESETS.map((preset) => (
                  <Select.Item key={preset} value={preset}>
                    {THEME_LABELS[preset]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-y-4">
          <Heading level="h2">
            {t("homeSettings.composition", { defaultValue: "Blocks" })}
          </Heading>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SlotSelect
              label={t("homeSettings.defaultMode", { defaultValue: "Default for visitors" })}
              value={doc.settings.defaultMode}
              options={MODE_OPTIONS}
              field="defaultMode"
              settings={doc.settings}
              onChange={(defaultMode) => setSettings({ defaultMode })}
            />
            <SlotSelect
              label={t("homeSettings.header", { defaultValue: "Header" })}
              value={doc.settings.header}
              options={HEADER_OPTIONS}
              field="header"
              settings={doc.settings}
              onChange={(header) => setSettings({ header })}
            />
            <SlotSelect
              label={t("homeSettings.hero", { defaultValue: "Hero" })}
              value={doc.settings.hero}
              options={HERO_OPTIONS}
              field="hero"
              settings={doc.settings}
              onChange={(hero) => setSettings({ hero })}
            />
            <SlotSelect
              label={t("homeSettings.tiles", { defaultValue: "Category tiles" })}
              value={doc.settings.tiles}
              options={TILES_OPTIONS}
              field="tiles"
              settings={doc.settings}
              onChange={(tiles) => setSettings({ tiles })}
            />
            <SlotSelect
              label={t("homeSettings.listing", { defaultValue: "Listing" })}
              value={doc.settings.listing}
              options={LISTING_OPTIONS}
              field="listing"
              settings={doc.settings}
              onChange={(listing) => setSettings({ listing })}
            />
            <SlotSelect
              label={t("homeSettings.footer", { defaultValue: "Footer" })}
              value={doc.settings.footer}
              options={FOOTER_OPTIONS}
              field="footer"
              settings={doc.settings}
              onChange={(footer) => setSettings({ footer })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-y-4">
          <Heading level="h2">
            {t("homeSettings.heroContent", { defaultValue: "Hero text" })}
          </Heading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="hero-title">
                {t("homeSettings.heroTitle", { defaultValue: "Headline" })}
              </Label>
              <Input
                id="hero-title"
                data-testid="hero-title"
                value={doc.content.hero.title}
                onChange={(e) => setHero({ title: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="hero-subtitle">
                {t("homeSettings.heroSubtitle", { defaultValue: "Subheadline" })}
              </Label>
              <Textarea
                id="hero-subtitle"
                data-testid="hero-subtitle"
                rows={2}
                value={doc.content.hero.subtitle}
                onChange={(e) => setHero({ subtitle: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="hero-cta-label">
                {t("homeSettings.heroCtaLabel", { defaultValue: "Button text" })}
              </Label>
              <Input
                id="hero-cta-label"
                data-testid="hero-cta-label"
                value={doc.content.hero.cta_label}
                onChange={(e) => setHero({ cta_label: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="hero-cta-href">
                {t("homeSettings.heroCtaHref", { defaultValue: "Button link" })}
              </Label>
              <Input
                id="hero-cta-href"
                data-testid="hero-cta-href"
                placeholder="/store"
                value={doc.content.hero.cta_href}
                onChange={(e) => setHero({ cta_href: e.target.value })}
              />
            </div>
            {/* The hero is a wide band on the storefront, so the preview is a wide band
                too: a 4:5 preview of a 16:9 crop teaches the wrong framing. */}
            <div className="md:col-span-2">
              <ModeImagePair
                label={t("homeSettings.heroImage", { defaultValue: "Image" })}
                help={t("homeSettings.heroImageHint", {
                  defaultValue:
                    "Only the hero versions that show a photograph use it; Announcement ignores it.",
                })}
                aspect="aspect-[16/9]"
                labels={modeImagePairLabels(t)}
                light={{
                  value: doc.content.hero.image_url ?? "",
                  onChange: (next) => setHero({ image_url: next || null }),
                  onUpload: (file) => onUpload(file, "light"),
                  uploading: uploading === "light",
                  testId: "hero-image",
                }}
                dark={{
                  value: doc.content.hero.image_url_dark ?? "",
                  onChange: (next) => setHero({ image_url_dark: next || null }),
                  onUpload: (file) => onUpload(file, "dark"),
                  uploading: uploading === "dark",
                  emptyHint: t("homeSettings.heroImageDarkEmpty", {
                    defaultValue: "Not set — dark mode shows the light image.",
                  }),
                  testId: "hero-image-dark",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-y-4">
          <Heading level="h2">
            {t("homeSettings.products", { defaultValue: "Which products the listing shows" })}
          </Heading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="products-source">
                {t("homeSettings.productsSource", { defaultValue: "Source" })}
              </Label>
              <Select
                value={doc.content.products.source}
                onValueChange={(next) =>
                  edit({
                    ...doc,
                    content: {
                      ...doc.content,
                      products:
                        next === "category"
                          ? {
                              source: "category",
                              category_id:
                                doc.content.products.source === "category"
                                  ? doc.content.products.category_id
                                  : "",
                              title:
                                doc.content.products.source === "category"
                                  ? doc.content.products.title
                                  : "",
                            }
                          : { source: "popular" },
                    },
                  })
                }
              >
                <Select.Trigger id="products-source" data-testid="products-source">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="popular">
                    {t("homeSettings.productsPopular", { defaultValue: "Popular" })}
                  </Select.Item>
                  <Select.Item value="category">
                    {t("homeSettings.productsCategory", {
                      defaultValue: "Products of a category",
                    })}
                  </Select.Item>
                </Select.Content>
              </Select>
              <Text size="small" className="text-ui-fg-subtle">
                {doc.content.products.source === "category"
                  ? t("homeSettings.productsCategoryWhy", {
                      defaultValue: "The listing shows the products of the category you pick.",
                    })
                  : t("homeSettings.productsPopularWhy", {
                      defaultValue:
                        "The listing shows your lead collection, the way it does today.",
                    })}
              </Text>
            </div>
            {doc.content.products.source === "category" ? (
              <>
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus">
                    {t("homeSettings.productsCategoryPick", { defaultValue: "Category" })}
                  </Label>
                  <Combobox
                    data-testid="products-category"
                    value={doc.content.products.category_id}
                    onChange={(next) =>
                      edit({
                        ...doc,
                        content: {
                          ...doc.content,
                          products: {
                            source: "category",
                            category_id: (next as string) ?? "",
                            title:
                              doc.content.products.source === "category"
                                ? doc.content.products.title
                                : "",
                          },
                        },
                      })
                    }
                    {...categories}
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus" htmlFor="products-title">
                    {t("homeSettings.productsTitle", { defaultValue: "Heading above the products" })}
                  </Label>
                  <Input
                    id="products-title"
                    data-testid="products-title"
                    value={doc.content.products.title}
                    onChange={(e) =>
                      edit({
                        ...doc,
                        content: {
                          ...doc.content,
                          products: {
                            source: "category",
                            category_id:
                              doc.content.products.source === "category"
                                ? doc.content.products.category_id
                                : "",
                            title: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-y-4">
          <Heading level="h2">
            {t("homeSettings.order", { defaultValue: "Order of the blocks" })}
          </Heading>
          <ol className="flex flex-col gap-y-2 max-w-[420px]" data-testid="block-order">
            {doc.content.order.map((block, index) => (
              <li
                key={block}
                data-testid={`block-order-${block}`}
                className="flex items-center justify-between rounded-md border border-ui-border-base px-3 py-2"
              >
                <Text size="small">{`${index + 1}. ${BLOCK_LABELS[block]}`}</Text>
                <div className="flex items-center gap-x-1">
                  <IconButton
                    size="small"
                    variant="transparent"
                    disabled={index === 0}
                    onClick={() => moveBlock(index, -1)}
                    aria-label={t("homeSettings.moveUp", { defaultValue: "Move up" })}
                    data-testid={`block-up-${block}`}
                  >
                    <ArrowUpMini />
                  </IconButton>
                  <IconButton
                    size="small"
                    variant="transparent"
                    disabled={index === doc.content.order.length - 1}
                    onClick={() => moveBlock(index, 1)}
                    aria-label={t("homeSettings.moveDown", { defaultValue: "Move down" })}
                    data-testid={`block-down-${block}`}
                  >
                    <ArrowDownMini />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
          {omitted.length ? (
            <div className="flex flex-col gap-y-2 max-w-[420px]">
              <Text size="small" className="text-ui-fg-subtle">
                {t("homeSettings.omitted", {
                  defaultValue: "Not shown on the home page:",
                })}
              </Text>
              {omitted.map((block) => (
                <div
                  key={block}
                  className="flex items-center justify-between rounded-md border border-dashed border-ui-border-base px-3 py-2"
                >
                  <Text size="small" className="text-ui-fg-muted">
                    {BLOCK_LABELS[block]}
                  </Text>
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() =>
                      edit({
                        ...doc,
                        content: { ...doc.content, order: [...doc.content.order, block] },
                      })
                    }
                    data-testid={`block-add-${block}`}
                  >
                    {t("homeSettings.show", { defaultValue: "Show" })}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {doc.content.order.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {doc.content.order.map((block) => (
                <Button
                  key={`hide-${block}`}
                  size="small"
                  variant="transparent"
                  onClick={() =>
                    edit({
                      ...doc,
                      content: {
                        ...doc.content,
                        order: doc.content.order.filter((b) => b !== block),
                      },
                    })
                  }
                  data-testid={`block-hide-${block}`}
                >
                  {t("homeSettings.hide", {
                    defaultValue: "Hide {{block}}",
                    block: BLOCK_LABELS[block],
                  })}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </Container>
    </SingleColumnPage>
  )
}
