import { useTranslation } from "react-i18next"

import { bestForeground } from "./contrast"

const HEX = /^#[0-9a-fA-F]{6}$/

/** «Предпросмотр шапки»: the shop's header in miniature, the logo (or the short name in its
 * place) and a button in the primary colour. The colour is the owner's own value, so it is an
 * inline style; without one the button keeps the storefront theme's colour. */
export const HeaderPreview = ({
  logoUrl,
  name,
  color,
}: {
  logoUrl: string | null
  name: string
  color: string
}) => {
  const { t } = useTranslation()

  return (
    <div
      className="flex h-14 w-full min-w-0 max-w-full items-center justify-between gap-x-3 rounded-md border border-ui-border-base bg-ui-bg-base px-4 sm:min-w-[18rem]"
      data-testid="branding-header-preview"
    >
      <span className="flex min-w-0 items-center gap-x-2 truncate txt-compact-medium-plus uppercase text-ui-fg-base">
        {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-auto max-w-[8rem] object-contain" /> : name}
      </span>
      <span
        className="shrink-0 rounded-md px-3 py-1.5 txt-compact-small-plus"
        style={
          HEX.test(color)
            ? { backgroundColor: color, color: bestForeground(color) }
            : { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
        }
      >
        {t("brandingSettings.previewButton")}
      </span>
    </div>
  )
}
