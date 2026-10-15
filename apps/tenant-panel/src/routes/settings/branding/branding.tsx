import { useTranslation } from "react-i18next"

import {
  SettingsDetail,
  type SettingsSection,
} from "../../../components/settings"
import { useTenantBranding } from "../../../hooks/api/branding"
import { useStore } from "../../../hooks/api/store"
import { AppIconsPreview } from "./app-icons"
import { BrandingImageTile, BrandingThumb } from "./branding-file"
import { HeaderPreview } from "./header-preview"

// «Оформление» (t16-owner-branding): логотип (светлый/тёмный), фавикон,
// картинка для соцсетей, основной цвет и подпись в подвале. Своя вкладка
// панели, как /settings/notifications рядом — у Admin аналога нет.
//
// t-2026-10-14-01 (panel redesign, G1 part 4): the page only reads. Three
// sections after the prototype, by the owner's three questions — what is in
// the header, how the app icon looks, which colour — each edited in its own
// drawer on its own nested route (`logo/edit`, `icons/edit`, `color/edit`).
// The previews of the icons and of the header stay on the page: they are
// looked at more often than changed.
//
// t-2026-10-14-01 (release stand 14.10, Ivan: «сеткой 2х2 вместо строк и
// сразу поставить плейсхолдеры изображений»): the four pictures, both logos,
// the social image and the favicon, are one 2×2 grid of tiles at the top,
// each opening the drawer it is edited in. The favicon's tile replaces its row
// in «Иконка приложения», whose header now says whether the set was built
// (decide: one grid, the favicon row would repeat the same picture).

export const BrandingSettings = () => {
  const { t } = useTranslation()
  const { branding, isPending, isError, error } = useTenantBranding()
  const { store } = useStore()

  if (isError) {
    throw error
  }

  const shopName = branding?.shop_name_short || store?.name || t("brandingSettings.previewShopName")
  const icons = branding?.app_icons ?? null
  const favicon = branding?.favicon_url ?? null
  const color = branding?.primary_color ?? null
  const credit = branding?.footer_credit ?? null

  const sections: SettingsSection[] = [
    {
      id: "logo",
      title: t("brandingSettings.title"),
      description: t("brandingSettings.subtitle"),
      editTo: "logo/edit",
      lead: (
        <div className="grid grid-cols-2 gap-2" data-testid="branding-image-grid">
          <BrandingImageTile
            id="logo_light"
            to="logo/edit"
            label={t("brandingSettings.fields.logoLight")}
            url={branding?.logo_light_url}
            shape="logo"
          />
          <BrandingImageTile
            id="logo_dark"
            to="logo/edit"
            label={t("brandingSettings.fields.logoDark")}
            url={branding?.logo_dark_url}
            shape="logo"
            dark
          />
          <BrandingImageTile
            id="og_image"
            to="logo/edit"
            label={t("brandingSettings.fields.ogImage")}
            url={branding?.og_image_url}
            shape="cover"
          />
          <BrandingImageTile
            id="favicon"
            to="icons/edit"
            label={t("brandingSettings.fields.favicon")}
            url={favicon}
            shape="icon"
          />
        </div>
      ),
      rows: [
        {
          id: "shop_name_short",
          label: t("brandingSettings.fields.shopNameShort"),
          value: branding?.shop_name_short || null,
          hint: branding?.shop_name_short
            ? t("brandingSettings.fields.shopNameShortHint")
            : t("brandingSettings.fields.shopNameShortEmpty"),
        },
      ],
    },
    {
      id: "icons",
      title: t("brandingSettings.appIcons.title"),
      description: t("brandingSettings.appIcons.subtitle"),
      editTo: "icons/edit",
      status: favicon
        ? icons
          ? { color: "green", label: t("brandingSettings.appIcons.built") }
          : { color: "orange", label: t("brandingSettings.appIcons.notBuilt") }
        : undefined,
      rows: [
        {
          id: "icons_preview",
          label: t("brandingSettings.appIcons.preview"),
          value: <AppIconsPreview icons={icons} faviconUrl={favicon} shopName={shopName} />,
          hint: favicon
            ? icons
              ? undefined
              : t("brandingSettings.appIcons.notBuiltHint")
            : t("brandingSettings.appIcons.empty"),
        },
        {
          id: "icon_maskable",
          label: t("brandingSettings.appIcons.maskable"),
          value: icons?.icon_maskable_512_url ? (
            <BrandingThumb url={icons.icon_maskable_512_url} shape="icon" />
          ) : null,
          hint: t("brandingSettings.appIcons.maskableRead"),
        },
        {
          id: "icon_mono",
          label: t("brandingSettings.appIcons.mono"),
          value: icons?.mask_icon_url ? <BrandingThumb url={icons.mask_icon_url} shape="icon" /> : null,
          hint: t("brandingSettings.appIcons.monoRead"),
        },
      ],
    },
    {
      id: "color",
      title: t("brandingSettings.color.title"),
      description: t("brandingSettings.color.subtitle"),
      editTo: "color/edit",
      rows: [
        {
          id: "primary_color",
          label: t("brandingSettings.fields.primaryColor"),
          value: color ? (
            <div className="flex items-center gap-x-2">
              <span
                className="h-5 w-6 shrink-0 rounded border border-ui-border-strong"
                // The owner's own colour, the one value on this screen that is not a token.
                style={{ backgroundColor: color }}
              />
              <span className="txt-compact-small font-mono uppercase text-ui-fg-base">{color}</span>
            </div>
          ) : null,
          // The platform's own check (`low_contrast`, `primary_foreground`) is what the row says.
          status: color
            ? branding?.low_contrast
              ? { color: "orange", label: t("brandingSettings.color.lowContrast") }
              : {
                  color: "green",
                  label:
                    branding?.primary_foreground === "#000000"
                      ? t("brandingSettings.color.readsWithBlack")
                      : t("brandingSettings.color.readsWithWhite"),
                }
            : undefined,
          hint: color
            ? branding?.low_contrast
              ? t("brandingSettings.fields.lowContrast")
              : undefined
            : t("brandingSettings.color.empty"),
        },
        {
          id: "header_preview",
          label: t("brandingSettings.preview"),
          value: (
            <HeaderPreview logoUrl={branding?.logo_light_url ?? null} name={shopName} color={color ?? ""} />
          ),
        },
        {
          id: "footer_credit",
          label: t("brandingSettings.fields.footerCreditEnabled"),
          value: credit?.enabled ? credit.text : null,
          status: credit?.enabled
            ? { color: "green", label: t("brandingSettings.credit.on") }
            : { color: "grey", label: t("brandingSettings.credit.off") },
          hint: credit?.enabled
            ? credit.href
              ? t("brandingSettings.credit.linksTo", { href: credit.href })
              : undefined
            : t("brandingSettings.fields.footerCreditDescription"),
        },
      ],
    },
  ]

  return <SettingsDetail isPending={isPending} sections={sections} />
}
