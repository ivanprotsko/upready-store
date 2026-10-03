import { useTranslation } from "react-i18next"
import { Label, Text } from "@medusajs/ui"

import type { TenantAppIcons } from "../../../hooks/api/branding"
import { UploadSlot } from "./upload-slot"

// «Иконка приложения» (t-2026-10-03-61): the icon set the backend built from
// the favicon, shown the way each platform paints it (a browser tab in light
// and dark chrome, the iOS home screen, an Android launcher), plus the two
// optional masters that refine it. The platform frames are fixed colours on
// purpose: they imitate a browser and a phone, not the panel's own theme.

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

export const AppIcons = ({
  icons,
  faviconUrl,
  shopName,
  busy,
  onRefine,
}: {
  icons: TenantAppIcons | null
  faviconUrl: string | null
  shopName: string
  busy: boolean
  onRefine: (fields: Partial<TenantAppIcons>) => void
}) => {
  const { t } = useTranslation()

  const tabIcon = icons?.icon_svg_url ?? icons?.icon_192_url ?? faviconUrl
  const iosIcon = icons?.apple_touch_icon_url ?? faviconUrl
  const androidIcon = icons?.icon_maskable_512_url ?? icons?.icon_512_url ?? faviconUrl

  return (
    <div className="flex flex-col gap-y-4 px-6 py-6">
      <div className="flex flex-col gap-y-1">
        <Label size="small" weight="plus">
          {t("brandingSettings.appIcons.title", { defaultValue: "Иконка приложения" })}
        </Label>
        <Text size="small" className="text-ui-fg-subtle">
          {icons
            ? t("brandingSettings.appIcons.subtitle", {
                defaultValue:
                  "Из фавикона собран набор для вкладки браузера, экрана «Домой» на iOS, Android, плиток Windows и Dock на macOS.",
              })
            : t("brandingSettings.appIcons.empty", {
                defaultValue: "Загрузите фавикон, и из него соберётся набор иконок для браузера, iOS, Android, Windows и macOS.",
              })}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3" data-testid="branding-app-icons-preview">
        <div className="flex flex-col gap-y-2">
          <Text size="small" className="text-ui-fg-subtle">
            {t("brandingSettings.appIcons.previewTab", { defaultValue: "Вкладка браузера" })}
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

        <div className="flex flex-col gap-y-2">
          <Text size="small" className="text-ui-fg-subtle">
            {t("brandingSettings.appIcons.previewIos", { defaultValue: "iOS, экран «Домой»" })}
          </Text>
          <div className="flex h-[6.5rem] items-center justify-center rounded-md" style={{ background: WALLPAPER }}>
            <HomeScreenIcon src={iosIcon} name={shopName} radius={IOS_RADIUS} />
          </div>
        </div>

        <div className="flex flex-col gap-y-2">
          <Text size="small" className="text-ui-fg-subtle">
            {t("brandingSettings.appIcons.previewAndroid", { defaultValue: "Android" })}
          </Text>
          <div className="flex h-[6.5rem] items-center justify-center rounded-md" style={{ background: WALLPAPER }}>
            <HomeScreenIcon src={androidIcon} name={shopName} radius="50%" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <UploadSlot
          label={t("brandingSettings.appIcons.maskable", { defaultValue: "Иконка для Android (необязательно)" })}
          hint={t("brandingSettings.appIcons.maskableHint", {
            defaultValue:
              "Квадрат с полем на весь кадр, знак в центральных 80%: Android обрезает края по форме значка. Без неё иконка собирается из фавикона.",
          })}
          kind="favicon_maskable"
          url={icons?.icon_maskable_512_url ?? null}
          busy={busy}
          disabled={!icons}
          removable={false}
          onChange={(_url, fields) => fields && onRefine(fields)}
        />
        <UploadSlot
          label={t("brandingSettings.appIcons.mono", { defaultValue: "Одноцветный силуэт (необязательно)" })}
          hint={t("brandingSettings.appIcons.monoHint", {
            defaultValue:
              "SVG, одна фигура на прозрачном фоне для закреплённой вкладки Safari. Без него силуэт собирается из фавикона.",
          })}
          kind="favicon_mono"
          accept="image/svg+xml"
          url={icons?.mask_icon_url ?? null}
          busy={busy}
          disabled={!icons}
          removable={false}
          onChange={(_url, fields) => fields && onRefine(fields)}
        />
      </div>
    </div>
  )
}
