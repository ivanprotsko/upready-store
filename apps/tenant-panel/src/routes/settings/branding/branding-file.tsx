import { Text, clx } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

// t-2026-10-14-01 (panel redesign, G1 part 4): how a stored branding file
// reads, on the page and in the drawers. Storage keeps a machine name
// (`branding-logo_light-<time>.svg`), so a saved file reads as its picture and
// its format; the name the owner gave it shows only right after the upload
// (decide d-2026-10-14-187).

const FORMATS: Record<string, string> = { svg: "SVG", png: "PNG", webp: "WebP", ico: "ICO" }

/** «SVG», «PNG», «WebP» from the file's address; `null` when it says nothing. */
export const fileFormat = (url: string | null | undefined): string | null => {
  const extension = url?.split(/[?#]/)[0].split(".").pop()?.toLowerCase()
  return (extension && FORMATS[extension]) || null
}

/** The file's size the way the owner reads it: «4 КБ», «1,2 МБ». */
export const useFileSize = () => {
  const { t, i18n } = useTranslation()

  return (bytes: number) => {
    const kb = bytes / 1024
    if (kb < 1024) {
      return t("brandingSettings.file.sizeKb", { size: Math.max(1, Math.round(kb)) })
    }
    const mb = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(kb / 1024)
    return t("brandingSettings.file.sizeMb", { size: mb })
  }
}

export type BrandingThumbShape = "logo" | "icon" | "cover"

/** The file's own picture on a tile: a logo whole, an icon square, the social image cropped.
 * A dark-theme logo is light ink, so it sits on the dark tile. */
export const BrandingThumb = ({
  url,
  shape,
  dark = false,
}: {
  url: string
  shape: BrandingThumbShape
  dark?: boolean
}) => (
  <span
    className={clx(
      "flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-border-base",
      shape === "icon" ? "w-8" : "w-16",
      dark ? "bg-ui-contrast-bg-base" : "bg-ui-bg-subtle"
    )}
  >
    <img
      src={url}
      alt=""
      className={shape === "cover" ? "h-full w-full object-cover" : "max-h-6 max-w-[3.5rem] object-contain"}
    />
  </span>
)

/** A read-page value: the picture and its format. */
export const BrandingFileValue = ({
  url,
  shape,
  dark,
}: {
  url: string
  shape: BrandingThumbShape
  dark?: boolean
}) => {
  const format = fileFormat(url)

  return (
    <div className="flex min-w-0 items-center gap-x-3">
      <BrandingThumb url={url} shape={shape} dark={dark} />
      {format ? (
        <Text size="small" leading="compact">
          {format}
        </Text>
      ) : null}
    </div>
  )
}
