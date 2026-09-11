import Image from "next/image"

import { hasPair } from "@lib/util/mode-image"
import type { ThemeMode } from "@lib/theme"

/**
 * One image slot that can hold two versions — light and dark
 * (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). Every surface that shows a paired image
 * goes through this component, so the swap rule is written once: the hero, the category
 * tiles and the product card would otherwise each grow their own copy of it.
 *
 * WHY CSS AND NOT A CLIENT SUBSCRIPTION. The visitor's mode lives in their own
 * `localStorage` and is applied by the pre-paint script before hydration
 * (`app/layout.tsx`, `lib/theme/pre-paint.ts`), so the server cannot know it. A component
 * that resolved the version in the browser would therefore paint the WRONG version on
 * every load for every dark-mode visitor and then swap it — a flash on each page view,
 * and no bytes saved either, because the wrong version is already in the SSR HTML. Both
 * versions in the markup with CSS choosing is right from the first paint and needs no JS
 * at all: `tailwind.config.js` already points `darkMode` at `[data-mode="dark"]`, the very
 * attribute the mode toggle writes.
 *
 * WHY THE HIDDEN LAYER IS FREE. Measured on Chromium, WebKit and Firefox
 * (`artifacts/docs/mode-image-pairs/measure-lazy.cjs`): an image inside a `display:none`
 * box with `loading="lazy"` is not requested at all until something shows it, while the
 * same image without `lazy` is requested at load. So the inactive layer is ALWAYS lazy and
 * never `priority`, and a page costs exactly what it costs today until the visitor flips
 * the mode. `modules/layout/components/mode-toggle` warms the layers it is about to show
 * before it writes the attribute, which is what keeps the flip from showing an empty frame.
 *
 * NO PAIR, NO SECOND LAYER. With no dark version (the normal state: the pair is optional
 * on all three surfaces) this renders the single `<Image>` the call site rendered before,
 * `priority` included — the markup of every existing shop is unchanged.
 *
 * Always `fill`: every call site is a layer inside a frame that owns the aspect ratio, and
 * that is what keeps the flip from moving the layout.
 */
export default function ModeImage({
  src,
  srcDark,
  alt,
  mode,
  priority,
  quality,
  sizes,
  className,
  draggable,
  "data-testid": dataTestid,
}: {
  /** The base version — shown in any mode, and the only one when there is no pair. */
  src: string
  /** The dark version, or null/absent when the owner never filled it. */
  srcDark?: string | null
  alt: string
  /**
   * The mode this request renders with, when the call site knows it (the home page does,
   * `lib/data/tenant-home.ts` `resolveRequestMode`). It decides which of the two layers
   * may carry `priority`. Absent means neither does: a preload hint pointed at the layer
   * the visitor is not looking at is worse than no hint.
   */
  mode?: ThemeMode | null
  priority?: boolean
  quality?: number
  sizes?: string
  className?: string
  draggable?: boolean
  "data-testid"?: string
}) {
  const paired = hasPair(src, srcDark)

  if (!paired) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        quality={quality}
        sizes={sizes}
        draggable={draggable}
        className={className}
        data-testid={dataTestid}
      />
    )
  }

  // `priority` and `loading` are mutually exclusive in next/image, so each layer gets
  // exactly one of them.
  const dark = mode === "dark"
  const layer = (isDark: boolean) => ({
    ...(priority && dark === isDark ? { priority: true } : { loading: "lazy" as const }),
  })

  return (
    <>
      <span data-mode-image="light" className="absolute inset-0 dark:hidden">
        <Image
          src={src}
          alt={alt}
          fill
          quality={quality}
          sizes={sizes}
          draggable={draggable}
          className={className}
          data-testid={dataTestid}
          {...layer(false)}
        />
      </span>
      <span data-mode-image="dark" className="absolute inset-0 hidden dark:block">
        <Image
          src={srcDark as string}
          alt={alt}
          fill
          quality={quality}
          sizes={sizes}
          draggable={draggable}
          className={className}
          {...layer(true)}
        />
      </span>
    </>
  )
}
