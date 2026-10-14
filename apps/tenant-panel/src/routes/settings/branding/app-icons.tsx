import { useTranslation } from "react-i18next"
import { Text } from "@medusajs/ui"

import type { TenantAppIcons } from "../../../hooks/api/branding"

// «Иконка приложения → Как выглядит» (t-2026-10-03-61): the icon set the
// backend built from the favicon, shown the way each platform paints it (a
// browser tab in light and dark chrome, the iOS home screen, an Android
// launcher). The platform frames are fixed colours on purpose: they imitate a
// browser and a phone, not the panel's own theme.
//
// t-2026-10-14-01 (panel redesign, G1 part 4): the preview only. The page shows
// it as the row «Как выглядит», the icon drawer shows it live under the
// favicon; the two optional masters moved into that drawer.

const TAB_CHROME = [
  { key: "light", bar: "#dee1e6", tab: "#ffffff", text: "#1f1f1f" },
  { key: "dark", bar: "#202124", tab: "#35363a", text: "#e8eaed" },
] as const

const WALLPAPER = "linear-gradient(160deg, #3a6186 0%, #89253e 100%)"

/** iOS's home-screen corner, close enough to its squircle at this size. */
const IOS_RADIUS = "22.5%"

const HomeScreenIcon = ({ src, name, radius }: { src: string | null; name: string; radius: string }) => (
  <div className="flex w-16 flex-col items-center gap-y-1">
    {src ? (
      <img src={src} alt="" className="h-14 w-14 object-cover" style={{ borderRadius: radius }} />
    ) : (
      <div className="h-14 w-14 bg-ui-bg-component" style={{ borderRadius: radius }} />
    )}
    <span className="w-16 truncate text-center text-[11px] leading-tight text-white">{name}</span>
  </div>
)

export const AppIconsPreview = ({
  icons,
  faviconUrl,
  shopName,
}: {
  icons: TenantAppIcons | null
  faviconUrl: string | null
  shopName: string
}) => {
  const { t } = useTranslation()

  const tabIcon = icons?.icon_svg_url ?? icons?.icon_192_url ?? faviconUrl
  const iosIcon = icons?.apple_touch_icon_url ?? faviconUrl
  const androidIcon = icons?.icon_maskable_512_url ?? icons?.icon_512_url ?? faviconUrl

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:min-w-[24rem] lg:grid-cols-3" data-testid="branding-app-icons-preview">
      <div className="flex min-w-0 flex-col gap-y-2">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("brandingSettings.appIcons.previewTab")}
        </Text>
        {TAB_CHROME.map((chrome) => (
          <div key={chrome.key} className="rounded-md px-2 pt-2" style={{ backgroundColor: chrome.bar }}>
            <div
              className="flex h-8 max-w-[12rem] items-center gap-x-2 rounded-t-lg px-3"
              style={{ backgroundColor: chrome.tab, color: chrome.text }}
            >
              {tabIcon ? (
                <img src={tabIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full bg-ui-bg-component" />
              )}
              <span className="truncate text-xs">{shopName}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-y-2">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("brandingSettings.appIcons.previewIos")}
        </Text>
        <div className="flex h-[6.5rem] items-center justify-center rounded-md" style={{ background: WALLPAPER }}>
          <HomeScreenIcon src={iosIcon} name={shopName} radius={IOS_RADIUS} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-y-2">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("brandingSettings.appIcons.previewAndroid")}
        </Text>
        <div className="flex h-[6.5rem] items-center justify-center rounded-md" style={{ background: WALLPAPER }}>
          <HomeScreenIcon src={androidIcon} name={shopName} radius="50%" />
        </div>
      </div>
    </div>
  )
}
