import { Photo } from "@medusajs/icons"
import { Text, clx } from "@medusajs/ui"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

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

/** A grey stand-in for a picture: the image icon, and a word when there is room. */
export const ImagePlaceholder = ({ label, className }: { label?: string; className?: string }) => (
  <span
    className={clx(
      "flex flex-col items-center justify-center gap-y-1 bg-ui-bg-component text-ui-fg-subtle",
      className
    )}
    data-testid="branding-image-placeholder"
  >
    <Photo />
    {label ? (
      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
    ) : null}
  </span>
)

/**
 * The file's picture, or `fallback` when there is none or it does not load
 * (t-2026-10-14-01): never the browser's broken-image icon, the same rule as
 * the shared `Thumbnail` (o21 H2). The failure is kept per address, so a new
 * file gets its own try.
 */
export const BrandingImage = ({
  src,
  className,
  fallback,
}: {
  src: string | null | undefined
  className?: string
  fallback: ReactNode
}) => {
  const [failed, setFailed] = useState<string | null>(null)

  if (!src || failed === src) {
    return <>{fallback}</>
  }

  return <img src={src} alt="" className={className} onError={() => setFailed(src)} />
}

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
    <BrandingImage
      src={url}
      className={shape === "cover" ? "h-full w-full object-cover" : "max-h-6 max-w-[3.5rem] object-contain"}
      fallback={<ImagePlaceholder className="h-full w-full" />}
    />
  </span>
)

const TILE_IMAGE: Record<BrandingThumbShape, string> = {
  logo: "max-h-[50%] max-w-[70%] object-contain",
  icon: "aspect-square h-1/2 object-contain",
  cover: "h-full w-full object-cover",
}

/**
 * One tile of the read page's 2×2 image grid (t-2026-10-14-01, Ivan 14.10:
 * «сеткой 2х2 вместо строк и сразу поставить плейсхолдеры изображений»): the
 * picture, or a grey «Не загружено» when there is none or it does not load,
 * with its name under it. A click opens the drawer the file is edited in.
 */
export const BrandingImageTile = ({
  id,
  to,
  label,
  url,
  shape,
  dark = false,
}: {
  id: string
  to: string
  label: string
  url: string | null | undefined
  shape: BrandingThumbShape
  dark?: boolean
}) => {
  const { t } = useTranslation()

  return (
    <Link
      to={to}
      data-testid={`branding-tile-${id}`}
      className="flex min-w-0 flex-col gap-y-2 rounded-lg p-2 outline-none transition-fg hover:bg-ui-bg-base-hover focus-visible:shadow-borders-focus"
    >
      <span
        className={clx(
          "flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-ui-border-base",
          dark ? "bg-ui-contrast-bg-base" : "bg-ui-bg-subtle"
        )}
      >
        <BrandingImage
          src={url}
          className={TILE_IMAGE[shape]}
          fallback={<ImagePlaceholder label={t("brandingSettings.file.empty")} className="h-full w-full" />}
        />
      </span>
      <Text size="small" weight="plus" leading="compact" className="text-ui-fg-subtle text-pretty">
        {label}
      </Text>
    </Link>
  )
}
