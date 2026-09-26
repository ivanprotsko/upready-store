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
 */

import { useEffect, useState } from "react"
import { Moon, Sun } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { applyMode, readCurrent } from "@lib/theme/apply"

type ModeToggleProps = {
  className?: string
  "data-testid"?: string
  /**
   * Branch `redesign-olavka` (Ivan's remark 20): a toggle button with a fixed name,
   * «Тёмная тема», and its state in `aria-pressed`, instead of the name of the action
   * («Переключить на тёмную тему»). Off: today's labels, no `aria-pressed`.
   */
  pressed?: boolean
}

export default function ModeToggle({
  className,
  "data-testid": testId,
  pressed = false,
}: ModeToggleProps) {
  const t = useTranslations("Nav")
  // Mirrors the existing studio popover's own `mode` state (`theme-panel/popover.tsx`):
  // read off `<html>` once mounted, since the pre-paint script may already have overwritten
  // SSR's fallback value from `localStorage` before this component hydrates. It is read in
  // an effect and not in the initial state: the server has no `<html>` to read, so on a shop
  // whose default is dark the first client render disagreed with the server's markup, and
  // React leaves such a mismatch as is — the wrong icon and label stayed until a click.
  const [mode, setMode] = useState("light")
  useEffect(() => {
    setMode(readCurrent()["data-mode"] ?? "light")
  }, [])
  const next = mode === "dark" ? "light" : "dark"

  return (
    <button
      type="button"
      onClick={() => {
        if (applyMode(next)) setMode(next)
      }}
      aria-label={
        pressed ? t("modeDark") : next === "light" ? t("modeToggleLight") : t("modeToggleDark")
      }
      aria-pressed={pressed ? mode === "dark" : undefined}
      data-testid={testId}
      className={className}
    >
      {mode === "dark" ? <Sun /> : <Moon />}
    </button>
  )
}
