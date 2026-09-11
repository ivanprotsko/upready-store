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
 * It also warms the paired images of the mode it is about to show, before writing the
 * attribute (`warmModeLayers()`, `lib/theme/warm-mode-layers.ts`). That belongs to the
 * TOGGLE and not to the image component: there is one toggle and three paired surfaces, so
 * one place knows the trick and none of them repeats it (rule 20). It lives in its own
 * module so a browser can be pointed at the real function rather than at a copy of it.
 */

import { useRef, useState } from "react"
import { Moon, Sun } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { applyMode, readCurrent } from "@lib/theme/apply"
import { warmModeLayers } from "@lib/theme/warm-mode-layers"

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
          await warmModeLayers(next)
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
