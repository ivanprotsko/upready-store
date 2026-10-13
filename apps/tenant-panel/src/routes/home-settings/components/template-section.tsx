import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button, Container, Heading, Label, Text, clx, toast, usePrompt } from "@medusajs/ui"
import { Spinner } from "@medusajs/icons"

import { SegmentedControl } from "../../../components/common/segmented-control"
import { useApplyTenantTemplate, useTenantTemplates } from "../../../hooks/api/home"
import type { TenantHomeDocument } from "../composition"
import {
  LAYER_NAMES,
  PHOTO_RATIO,
  RADIUS_PX,
  densityGapPx,
  failureText,
  initialChoice,
  isTemplateOwn,
  orderTemplates,
  overridesFrom,
  paletteAllowed,
  previewHref,
  swatchFor,
  templateChoice,
  textFor,
  type LayerName,
  type PaletteEntry,
  type TemplateCard,
  type TemplateCatalogue,
  type TemplateChoice,
  type TemplateLayers,
  type TemplateText,
} from "../templates"

// tenant-panel: the «Шаблоны» section of `/home-settings` (t-2026-10-12-33 P2). The owner
// picks a store template, adjusts its palette and four layers on a schematic preview, and
// applies it through `POST /tenants/home/template`. Section texts are not edited here: a
// section keeps the props its template gives it (the next step; the catalogue already marks
// `propsEditable`). The logic lives in `../templates.ts`; this file only draws it.

/** The storefront that answers `?template=<id>`; production storefronts have the preview off. */
const PREVIEW_ORIGIN = import.meta.env.VITE_TEMPLATE_PREVIEW_ORIGIN as string | undefined

/** Plain words for every layer value (rule 18e): an enum value never reaches the screen. */
const LAYER_LABELS: Record<LayerName, { key: string; label: string; values: Record<string, string> }> = {
  radius: { key: "radius", label: "Corners", values: { sharp: "Square", soft: "Soft", round: "Round", pill: "Pill" } },
  buttonStyle: { key: "buttonStyle", label: "Buttons", values: { filled: "Filled", outlined: "Outlined" } },
  // The proportions themselves: short enough for four segments on a phone, and what a photo is cut to.
  photoStyle: {
    key: "photoStyle",
    label: "Photo proportions",
    values: { square: "1:1", portrait: "3:4", landscape: "4:3", wide: "16:9" },
  },
  density: {
    key: "density",
    label: "Spacing",
    values: { compact: "Compact", comfortable: "Regular", spacious: "Spacious" },
  },
}

/** One row of the schematic per section, shaped after its block's category. */
const SectionShape = ({
  category,
  colours,
  layers,
}: {
  category: string
  colours: ReturnType<typeof swatchFor>
  layers: TemplateLayers
}) => {
  const radius = RADIUS_PX[layers.radius]
  const line = (width: string, colour = colours.foreground, opacity = 0.7) => (
    <div style={{ height: 3, width, background: colour, opacity, borderRadius: 2 }} />
  )
  const button = (
    <div
      style={{
        height: 7,
        width: 26,
        borderRadius: layers.radius === "pill" ? 999 : radius,
        background: layers.buttonStyle === "filled" ? colours.primary : "transparent",
        border: `1px solid ${colours.primary}`,
      }}
    />
  )
  const cards = (count: number, withText: boolean) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 4 }}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ aspectRatio: PHOTO_RATIO[layers.photoStyle], background: colours.muted, borderRadius: radius }} />
          {withText ? line("80%") : null}
          {withText ? line("40%", colours.primary, 0.9) : null}
        </div>
      ))}
    </div>
  )

  switch (category) {
    case "announcement":
      return <div style={{ height: 5, background: colours.primary, borderRadius: 1 }} />
    case "hero":
      return (
        <div
          style={{
            background: colours.accent,
            borderRadius: radius,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minHeight: 44,
            justifyContent: "center",
          }}
        >
          {line("60%", colours.foreground, 0.9)}
          {line("40%")}
          {button}
        </div>
      )
    case "tiles":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} style={{ aspectRatio: "1 / 1", background: colours.accent, borderRadius: radius }} />
          ))}
        </div>
      )
    case "listing":
    case "collection":
      return cards(4, true)
    case "media":
    case "columns":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, alignItems: "center" }}>
          <div style={{ aspectRatio: PHOTO_RATIO[layers.photoStyle], background: colours.muted, borderRadius: radius }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {line("70%", colours.foreground, 0.9)}
            {line("90%")}
            {button}
          </div>
        </div>
      )
    case "testimonials":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} style={{ background: colours.muted, borderRadius: radius, padding: 4, display: "flex", flexDirection: "column", gap: 2 }}>
              {line("90%")}
              {line("60%")}
            </div>
          ))}
        </div>
      )
    case "banner":
    case "slideshow":
    case "collage":
    case "promo":
    case "video":
    case "countdown":
      return <div style={{ height: 30, background: colours.accent, borderRadius: radius }} />
    default:
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
          {line("50%", colours.foreground, 0.9)}
          {line("70%")}
        </div>
      )
  }
}

/**
 * A small page drawn from the template's own sections: a header bar, one row per section in
 * its category's shape, and a footer, painted in the chosen palette and shaped by the four
 * layers. No screenshot: it follows every choice at once.
 */
const SchematicPreview = ({
  template,
  palette,
  layers,
  sectionGapPx,
  className,
}: {
  template: TemplateCard
  palette: PaletteEntry | undefined
  layers: TemplateLayers
  sectionGapPx: TemplateCatalogue["sectionGapPx"]
  className?: string
}) => {
  if (!palette) return null
  const colours = swatchFor(palette, template.defaultMode)
  return (
    <div
      aria-hidden
      data-testid={`template-preview-${template.id}`}
      className={clx("overflow-hidden rounded-md border border-ui-border-base", className)}
      style={{ background: colours.background, padding: 8, display: "flex", flexDirection: "column", gap: densityGapPx(sectionGapPx, layers.density) }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ height: 5, width: 22, background: colours.foreground, borderRadius: 1 }} />
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 1, 2].map((dot) => (
            <div key={dot} style={{ height: 3, width: 10, background: colours.foreground, opacity: 0.5, borderRadius: 1 }} />
          ))}
        </div>
      </div>
      {template.sections.map((section, index) => (
        <SectionShape key={`${index}-${section.block}`} category={section.category} colours={colours} layers={layers} />
      ))}
      <div style={{ height: 16, background: colours.foreground, opacity: 0.9, borderRadius: 1, marginTop: 2 }} />
    </div>
  )
}

const Swatches = ({ palette, mode }: { palette: PaletteEntry | undefined; mode: "light" | "dark" }) => {
  if (!palette) return null
  const colours = swatchFor(palette, mode)
  return (
    <div className="flex items-center gap-x-1">
      {[colours.background, colours.foreground, colours.primary, colours.accent, colours.muted].map((colour, index) => (
        <span
          key={index}
          className="inline-block size-4 rounded-full border border-ui-border-base"
          style={{ background: colour }}
        />
      ))}
    </div>
  )
}

export const TemplateSection = ({
  dirty,
  onApplied,
}: {
  /** The page has edits not saved yet: applying drops them, so the dialog says so. */
  dirty: boolean
  /** The document the server wrote, so the page shows it and its next save starts from it. */
  onApplied: (home: TenantHomeDocument) => void
}) => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const { catalogue, isPending, isError } = useTenantTemplates()
  const { mutateAsync, isPending: applying } = useApplyTenantTemplate()
  const [openId, setOpenId] = useState<string | null>(null)
  const [choice, setChoice] = useState<TemplateChoice | null>(null)
  const [advisories, setAdvisories] = useState<string[]>([])

  const label = (layer: LayerName, value?: string) =>
    value
      ? t(`homeSettings.templates.${LAYER_LABELS[layer].key}.${value}`, { defaultValue: LAYER_LABELS[layer].values[value] })
      : t(`homeSettings.templates.${LAYER_LABELS[layer].key}.label`, { defaultValue: LAYER_LABELS[layer].label })
  /** A template's or a palette's words from the catalogue, in the panel's language. */
  const text = (value: TemplateText) => textFor(value, i18n.language)

  if (isPending) {
    return (
      <div className="flex items-center gap-x-2 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
        <Text size="small">{t("general.loading", { defaultValue: "Loading" })}</Text>
      </div>
    )
  }
  if (isError || !catalogue) {
    return (
      <Text size="small" className="text-ui-fg-error">
        {t("homeSettings.templates.loadFailed", { defaultValue: "The templates could not be loaded." })}
      </Text>
    )
  }

  const paletteById = new Map(catalogue.palettes.map((palette) => [palette.id, palette]))
  const open = catalogue.templates.find((template) => template.id === openId) ?? null
  const locale = i18n.language?.startsWith("en") ? "en" : "ru"

  const choose = (template: TemplateCard) => {
    if (openId === template.id) {
      setOpenId(null)
      return
    }
    setOpenId(template.id)
    setChoice(initialChoice(template, catalogue.current))
    setAdvisories([])
  }

  const apply = async (template: TemplateCard, picked: TemplateChoice) => {
    const confirmed = await prompt({
      title: t("homeSettings.templates.confirmTitle", { defaultValue: "Apply «{{title}}»?", title: text(template.title) }),
      description: [
        t("homeSettings.templates.confirmDescription", {
          defaultValue:
            "The template replaces the header, the footer, the order of the home sections and the look of the shop. Your texts, products and banners stay.",
        }),
        dirty
          ? t("homeSettings.templates.confirmUnsaved", {
              defaultValue: "Changes on this page that are not saved yet will be dropped.",
            })
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      confirmText: t("homeSettings.templates.confirm", { defaultValue: "Apply" }),
      cancelText: t("actions.cancel", { defaultValue: "Cancel" }),
      variant: "confirmation",
    })
    if (!confirmed) return

    try {
      const result = await mutateAsync({ id: template.id, overrides: overridesFrom(template, picked) })
      setAdvisories(result.advisories ?? [])
      onApplied(result.home)
      toast.success(t("homeSettings.saved", { defaultValue: "The home page was saved." }))
    } catch (e) {
      toast.error(
        failureText(e, t("homeSettings.templates.applyFailed", { defaultValue: "The template could not be applied." }))
      )
    }
  }

  return (
    <div className="flex flex-col gap-y-4" data-testid="home-templates-section">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2">{t("homeSettings.templates.heading", { defaultValue: "Templates" })}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("homeSettings.templates.hint", {
            defaultValue:
              "A template sets the header, the footer, the order of the home sections and the look. Your texts, products and banners stay.",
          })}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderTemplates(catalogue.templates, catalogue.current, i18n.language).map((template) => {
          const live = catalogue.current?.id === template.id
          const palette = paletteById.get(live ? catalogue.current!.palette : template.theme.palette)
          const layers = live && catalogue.current!.layers ? catalogue.current!.layers : templateChoice(template).layers
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => choose(template)}
              aria-expanded={openId === template.id}
              data-testid={`template-card-${template.id}`}
              className={clx(
                "flex flex-col gap-y-3 rounded-lg border bg-ui-bg-base p-3 text-left transition-colors hover:bg-ui-bg-base-hover focus-visible:shadow-borders-interactive-with-focus focus-visible:outline-none",
                openId === template.id ? "border-ui-border-interactive" : "border-ui-border-base"
              )}
            >
              <SchematicPreview template={template} palette={palette} layers={layers} sectionGapPx={catalogue.sectionGapPx} />
              <div className="flex items-start justify-between gap-x-2">
                <Text size="small" weight="plus">
                  {text(template.title)}
                </Text>
                {live ? (
                  <Badge size="2xsmall" color="green" data-testid="template-current">
                    {t("homeSettings.templates.current", { defaultValue: "Live on the storefront" })}
                  </Badge>
                ) : null}
              </div>
              <Text size="small" className="line-clamp-2 text-ui-fg-subtle">
                {text(template.description)}
              </Text>
              <div className="flex items-center justify-between gap-x-2">
                <Text size="xsmall" className="text-ui-fg-muted">
                  {t("homeSettings.templates.fonts", {
                    defaultValue: "{{display}} and {{body}}",
                    display: template.theme.fontPair.display,
                    body: template.theme.fontPair.body,
                  })}
                </Text>
                <Swatches palette={palette} mode={template.defaultMode} />
              </div>
            </button>
          )
        })}
      </div>

      {open && choice ? (
        <Container className="flex flex-col gap-y-6 p-4" data-testid="template-settings">
          <div className="flex items-center justify-between gap-x-4">
            <Heading level="h3">{text(open.title)}</Heading>
            {previewHref(PREVIEW_ORIGIN, locale, open.id) ? (
              <a
                href={previewHref(PREVIEW_ORIGIN, locale, open.id)!}
                target="_blank"
                rel="noreferrer"
                className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                data-testid="template-preview-link"
              >
                {t("homeSettings.templates.preview", { defaultValue: "Open preview" })}
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-y-5">
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("homeSettings.templates.palette", { defaultValue: "Palette" })}
                </Label>
                <div className="flex flex-wrap gap-2" role="group">
                  {catalogue.palettes.map((palette) => {
                    const allowed = paletteAllowed(open, palette)
                    const picked = choice.palette === palette.id
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        disabled={!allowed}
                        aria-pressed={picked}
                        onClick={() => setChoice({ ...choice, palette: palette.id })}
                        data-testid={`template-palette-${palette.id}`}
                        className={clx(
                          "flex items-center gap-x-2 rounded-md border px-2 py-1 txt-compact-small disabled:cursor-not-allowed disabled:opacity-40",
                          picked ? "border-ui-border-interactive bg-ui-bg-base" : "border-ui-border-base bg-ui-bg-subtle"
                        )}
                      >
                        <Swatches palette={palette} mode={open.defaultMode} />
                        <span>{text(palette.label)}</span>
                      </button>
                    )
                  })}
                </div>
                {catalogue.palettes.some((palette) => !paletteAllowed(open, palette)) ? (
                  <Text size="small" className="text-ui-fg-muted">
                    {t("homeSettings.templates.lightOnlyReason", {
                      defaultValue:
                        "The greyed palettes have a light theme only, and this template opens in the dark theme.",
                    })}
                  </Text>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {LAYER_NAMES.map((layer) => (
                  <div key={layer} className="flex flex-col gap-y-2" data-testid={`template-layer-${layer}`}>
                    <Label size="small" weight="plus">
                      {label(layer)}
                    </Label>
                    <SegmentedControl
                      value={choice.layers[layer]}
                      onValueChange={(value) =>
                        setChoice({ ...choice, layers: { ...choice.layers, [layer]: value } as TemplateLayers })
                      }
                      options={catalogue.layers[layer].map((value) => ({ value, label: label(layer, value) }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <SchematicPreview
              template={open}
              palette={paletteById.get(choice.palette)}
              layers={choice.layers}
              sectionGapPx={catalogue.sectionGapPx}
              className="self-start"
            />
          </div>

          {advisories.length ? (
            <div className="flex flex-col gap-y-1" data-testid="template-advisories">
              <Text size="small" weight="plus">
                {t("homeSettings.templates.advisories", { defaultValue: "Notes on the template:" })}
              </Text>
              {advisories.map((note) => (
                <Text key={note} size="small" className="text-ui-fg-subtle">
                  {note}
                </Text>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-x-2">
            <Button
              variant="secondary"
              size="small"
              disabled={isTemplateOwn(open, choice)}
              onClick={() => setChoice(templateChoice(open))}
              data-testid="template-reset"
            >
              {t("homeSettings.templates.reset", { defaultValue: "Reset to the template" })}
            </Button>
            <Button
              variant="primary"
              size="small"
              isLoading={applying}
              onClick={() => apply(open, choice)}
              data-testid="template-apply"
            >
              {t("homeSettings.templates.apply", { defaultValue: "Apply template" })}
            </Button>
          </div>
        </Container>
      ) : null}
    </div>
  )
}
