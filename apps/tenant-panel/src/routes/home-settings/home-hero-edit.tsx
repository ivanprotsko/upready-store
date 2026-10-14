import { Hint } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../components/settings"
import { ImageField } from "./components/image-field"
import { TextField } from "./components/text-field"
import { HERO_MAX, IMAGE_HEROES, heroShowsImage } from "./composition"
import { useHomeDocument, useUploadGate } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-hero-edit`): the
// text and the picture at the very top of the home page. The picture is offered
// only to the variants that show it (`HERO_SUPPORTS_IMAGE`); for the others the
// drawer says which variants do, and a stored picture is kept as it is. The
// picture is uploaded with `FileUpload`, never typed in as an address.
// Route `hero/edit`.

const schema = zod.object({
  title: zod.string().max(HERO_MAX.title),
  subtitle: zod.string().max(HERO_MAX.subtitle),
  cta_label: zod.string().max(HERO_MAX.cta_label),
  cta_href: zod.string().max(HERO_MAX.cta_href),
  image_url: zod.string().nullable(),
})

type HeroValues = zod.infer<typeof schema>

export const HomeHeroEdit = () => {
  const { t } = useTranslation()
  const { doc, isPending, save } = useHomeDocument()
  const uploads = useUploadGate()

  const variant = doc.settings.hero
  const option = (hero: string) => t(`homeSettings.options.hero.${hero}`)
  const { title, subtitle, cta_label, cta_href, image_url } = doc.content.hero

  return (
    <SettingsEditDrawer<HeroValues>
      title={t("homeSettings.hero.title")}
      description={t("homeSettings.hero.subtitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={{ title, subtitle, cta_label, cta_href, image_url }}
      onSubmit={uploads.guard((values: HeroValues) =>
        save((current) => ({
          ...current,
          content: {
            ...current.content,
            // The copy in other languages (`i18n`) rides along untouched.
            hero: {
              ...current.content.hero,
              ...values,
              image_url: values.image_url || null,
            },
          },
        }))
      )}
      successMessage={t("homeSettings.saved")}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="title"
            label={t("homeSettings.hero.heading")}
            maxLength={HERO_MAX.title}
            testId="home-hero-title"
          />
          <TextField
            control={form.control}
            name="subtitle"
            label={t("homeSettings.hero.subheading")}
            maxLength={HERO_MAX.subtitle}
            rows={2}
            testId="home-hero-subtitle"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="cta_label"
              label={t("homeSettings.hero.buttonLabel")}
              maxLength={HERO_MAX.cta_label}
              testId="home-hero-cta-label"
            />
            <TextField
              control={form.control}
              name="cta_href"
              label={t("homeSettings.hero.buttonHref")}
              hint={t("homeSettings.hero.buttonHrefHint")}
              placeholder="/store"
              maxLength={HERO_MAX.cta_href}
              testId="home-hero-cta-href"
            />
          </div>
          {heroShowsImage(variant) ? (
            <ImageField
              control={form.control}
              name="image_url"
              label={t("homeSettings.hero.image")}
              optional
              removable
              zoneHint={t("homeSettings.hero.imageZone")}
              onUploadingChange={uploads.track}
            />
          ) : (
            <Hint variant="info">
              {t("homeSettings.hero.imageUnused", {
                variant: option(variant),
                list: IMAGE_HEROES.map((hero) => `«${option(hero)}»`).join(", "),
              })}
            </Hint>
          )}
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { HomeHeroEdit as Component }
