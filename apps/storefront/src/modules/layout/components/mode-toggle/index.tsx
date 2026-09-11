"use client"

/**
 * The visitor-facing light/dark switch. Contract:
 * `artifacts/docs/2026-09-09-panel-composition-mockup.md` §S11-§S13.
 *
 * Writes the SAME `data-mode` axis the studio popover's own "Preview in this
 * browser" segment already writes (`applyMode()`, `lib/theme/apply.ts`) — one
 * mechanism, two entry points, so a click here, a click there and a reload (the
 * pre-paint script reads the same `localStorage` key) all agree. It never touches the
 * saved site-wide `defaultMode` (`store.metadata.storefrontSettings.defaultMode`) —
 * that stays the operator's own setting; this is always step 1 of the SSR resolution
 * order (§C6), which outranks it for THIS visitor only, per browser, exactly like every
 * other axis in `attributes.ts`.
 *
 * Rendered from two call sites with two different testids and layouts — the desktop
 * nav cluster (`nav-mode-toggle`) and the mobile bottom-nav's 6th slot
 * (`bottom-nav-mode-toggle`) — so sizing and visibility classes are the caller's job
 * (`className`), matching how `Search`/`CartButton` are styled per call site. Colors
 * come from this storefront's own `@medusajs/ui` tokens (`text-ui-fg-subtle` /
 * `hover:text-ui-fg-base`), matching every sibling nav icon; the workspace canon
 * (`~/upready/packages/geist-kit/AGENTS.md`) governs the icon and interaction rules
 * this follows regardless of which token set supplies the color: monochrome,
 * `currentColor`, sentence-case label, no weight added.
 *
 * Icon shows the mode a click switches TO — sun visible in dark mode, moon visible in
 * light mode, the macOS/GitHub convention (§Open forks, resolved (a)).
 *
 * It also warms the paired images of the mode it is about to show — see `warmLayers()`.
 * That belongs HERE and not in the image component: there is one toggle and three paired
 * surfaces, so one place knows the trick and none of them repeats it (rule 20).
 */

import { useRef, useState } from "react"
import { Moon, Sun } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { applyMode, readCurrent } from "@lib/theme/apply"

/**
 * Loads the image layers the next mode will show, before the attribute flips.
 *
 * A paired image keeps both versions in the markup and hides one with `display:none`
 * (`modules/common/components/mode-image`). The hidden layer is `loading="lazy"`, which is
 * what makes it free — measured on Chromium, WebKit and Firefox, such an image is not
 * requested at all until something shows it. The flip would therefore un-hide an image
 * that has not started loading, and the frame would stand empty for the length of the
 * request. Warming it first removes that gap.
 *
 * Two measured facts decide how (`artifacts/docs/mode-image-pairs/measure-warm.cjs`):
 *
 *   - setting `loading = "eager"` on a hidden lazy image DOES start the request, in all
 *     three engines, without showing it;
 *   - `img.decode()` does NOT — Chromium and WebKit never answer (measured past 800 ms)
 *     and Firefox rejects with `EncodingError`. So the readiness signal is `load`.
 *
 * Only layers whose frame is near the viewport are warmed: an image far below the fold is
 * exactly what `lazy` exists for, and waiting on twenty of them would delay the click it
 * is meant to smooth. The wait is capped, so the mode always flips — warm or not.
 */
const WARM_TIMEOUT_MS = 400

async function warmLayers(mode: string): Promise<void> {
  if (typeof document === "undefined") {
    return
  }

  const viewport = window.innerHeight
  const pending: HTMLImageElement[] = []

  for (const layer of Array.from(
    document.querySelectorAll<HTMLElement>(`[data-mode-image="${mode}"]`)
  )) {
    // The layer itself is `display:none`, so its own rect is all zeros — the frame around
    // it is what has a position on the page.
    const frame = layer.parentElement
    const box = frame?.getBoundingClientRect()
    if (!box || box.bottom < -viewport * 0.25 || box.top > viewport * 1.25) {
      continue
    }
    const image = layer.querySelector("img")
    if (image && !image.complete) {
      pending.push(image)
    }
  }

  if (!pending.length) {
    return
  }

  await Promise.race([
    Promise.all(
      pending.map((image) => {
        image.loading = "eager"
        return image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true })
              // A frame that fails to load must not hold the mode hostage.
              image.addEventListener("error", () => resolve(), { once: true })
            })
      })
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, WARM_TIMEOUT_MS)
    }),
  ])
}

type ModeToggleProps = {
  className?: string
  "data-testid"?: string
}

export default function ModeToggle({ className, "data-testid": testId }: ModeToggleProps) {
  const t = useTranslations("Nav")
  // Mirrors the existing studio popover's own `mode` state (`theme-panel/popover.tsx`):
  // read off `<html>` at mount, since the pre-paint script may already have overwritten
  // SSR's fallback value from `localStorage` before this component hydrates.
  const [mode, setMode] = useState(() => readCurrent()["data-mode"] ?? "light")
  // A second click while the first is still warming would fire a second flip at the same
  // frames; the window is at most WARM_TIMEOUT_MS.
  const warming = useRef(false)
  const next = mode === "dark" ? "light" : "dark"

  return (
    <button
      type="button"
      onClick={async () => {
        if (warming.current) {
          return
        }
        warming.current = true
        try {
          await warmLayers(next)
          if (applyMode(next)) setMode(next)
        } finally {
          warming.current = false
        }
      }}
      aria-label={next === "light" ? t("modeToggleLight") : t("modeToggleDark")}
      data-testid={testId}
      className={className}
    >
      {mode === "dark" ? <Sun /> : <Moon />}
    </button>
  )
}
