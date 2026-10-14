import { clx } from "@medusajs/ui"

import type { HomeBanner } from "../composition"

// The banner as the storefront draws it (Figma 238:17551): the picture, the
// kicker top-left, the label top-right, the title bottom-left and the button
// bottom-right. Its colours and chip sizes are the storefront's, not the
// panel's: this is a picture of the owner's shop, like the header preview of
// «Оформление». `compact` is the 96 × 56 thumbnail of a list row; the full size
// is the drawer's «Так увидит покупатель».

type Texts = Pick<HomeBanner, "kicker" | "label" | "title" | "button">

export const BannerCard = ({
  src,
  texts,
  compact = false,
}: {
  src: string
  texts: Texts
  compact?: boolean
}) => {
  const chip = clx(
    "absolute inline-flex font-semibold uppercase leading-none tracking-wide",
    compact ? "rounded-[3px] px-1 py-0.5 text-[6px]" : "rounded-[9px] px-2 py-1 text-[10px]"
  )
  // The four corners, closer to the edge on the thumbnail.
  const at = compact
    ? { tl: "left-1 top-1", tr: "right-1 top-1", bl: "bottom-1 left-1", br: "bottom-1 right-1" }
    : { tl: "left-4 top-4", tr: "right-4 top-4", bl: "bottom-4 left-4", br: "bottom-4 right-4" }

  return (
    <div
      className={clx(
        "relative shrink-0 overflow-hidden bg-ui-bg-subtle",
        compact ? "h-14 w-24 rounded-md" : "aspect-[572/400] w-full max-w-[420px] rounded-[24px]"
      )}
      data-testid={compact ? "banner-thumb" : "banner-preview"}
    >
      {src ? <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      {compact ? null : (
        <div className="pointer-events-none absolute inset-[3px] rounded-[21px] border-2 border-white" />
      )}
      {texts.kicker ? (
        <span className={clx(chip, at.tl, "bg-white text-[#1a1b09]")}>
          {texts.kicker}
        </span>
      ) : null}
      {texts.label ? (
        <span className={clx(chip, at.tr, "bg-[#312721] text-white")}>
          {texts.label}
        </span>
      ) : null}
      {texts.title ? (
        <span
          className={clx(
            chip,
            at.bl,
            "max-w-[45%] whitespace-pre-line bg-[#312721] text-white",
            compact ? "text-[7px] leading-tight" : "rounded-[14px] px-3 py-2 text-[14px] leading-tight"
          )}
        >
          {texts.title}
        </span>
      ) : null}
      {texts.button ? (
        <span className={clx(chip, at.br, "bg-white text-[#1a1b09]")}>
          {texts.button}
        </span>
      ) : null}
    </div>
  )
}
