"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { applyAxis, readCurrent, resetAxes } from "@lib/theme/apply"
import {
  THEME_IDS,
  THEME_LABELS,
  THEME_MODES,
  THEME_TOKEN_COUNT,
} from "@lib/theme/presets.generated"

import { CheckIcon, CloseIcon } from "./icons"

/**
 * The popover's contents: preset, mode, the source line, reset and lock.
 *
 * Every switch goes through src/lib/theme and nothing else — applyAxis() writes the
 * attribute on <html> and persists it, resetAxes() drops both. No axis is added today
 * (rule 32a); when T0j/T0k register `data-card` and `data-image-*` in AXES, this file
 * gains a section, not a mechanism.
 *
 * It mounts on the first click rather than with the button, and that is not a
 * lazy-loading trick: the state is read LIVE off <html>, which on the server is the
 * profile default and in the browser is whatever the visitor chose, so a component that
 * rendered in both places would disagree with itself at hydration.
 *
 * Language: English, like the rest of this repository's code and README. This is a
 * developer tool a shopper never sees, so it is deliberately not wired into the 36
 * next-intl catalogs (rule 32a).
 */

/** "default" is the SSR alias of the medusa preset; on screen it is that preset's row. */
function activePreset(value: string | undefined): string {
  return !value || value === "default" ? "medusa" : value
}

/** Presets in the order the reader sees them: alphabetical by label, never by id. */
const PRESETS = [...THEME_IDS].sort((a, b) =>
  (THEME_LABELS[a] ?? a).localeCompare(THEME_LABELS[b] ?? b)
)

export function Popover({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [theme, setTheme] = useState(() => activePreset(readCurrent()["data-theme"]))
  const [mode, setMode] = useState(() => readCurrent()["data-mode"] ?? "light")

  const pickTheme = (id: string) => {
    if (applyAxis("data-theme", id)) setTheme(id)
  }

  const pickMode = (next: string) => {
    if (applyAxis("data-mode", next)) setMode(next)
  }

  const reset = () => {
    resetAxes()
    const now = readCurrent()
    setTheme(activePreset(now["data-theme"]))
    setMode(now["data-mode"] ?? "light")
  }

  const lock = async () => {
    try {
      await fetch("/api/devtools/unlock", { method: "DELETE" })
    } catch {
      // the cookie outlives a failed request; the refresh below then changes nothing
    }
    onClose()
    router.refresh()
  }

  return (
    <div
      className="updev-popover"
      data-testid="devtools-popover"
      role="dialog"
      aria-label="Storefront devtools"
    >
      <div className="updev-head">
        <span className="updev-eyebrow">Storefront devtools</span>
        <button type="button" className="updev-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="updev-section">
        <span className="updev-label">Preset</span>
        <ul className="updev-list">
          {PRESETS.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="updev-row"
                data-testid={`devtools-preset-${id}`}
                aria-pressed={theme === id}
                onClick={() => pickTheme(id)}
              >
                <span
                  className="updev-swatch"
                  // the preset's own page and ink colours, straight out of themes.css;
                  // the Medusa bridge is switched off inside the swatch so it paints
                  // nothing but itself
                  data-theme={id}
                  data-mode={mode}
                  data-theme-bridge="off"
                  aria-hidden="true"
                />
                {THEME_LABELS[id] ?? id}
                {theme === id ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="updev-section">
        <span className="updev-label">Mode</span>
        <div className="updev-segment">
          {THEME_MODES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`devtools-mode-${id}`}
              aria-pressed={mode === id}
              onClick={() => pickMode(id)}
            >
              {id === "light" ? "Light" : "Dark"}
              {mode === id ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      </div>

      <p className="updev-source" data-testid="devtools-source">
        Rendered from <b>{THEME_TOKEN_COUNT}</b> tokens of preset{" "}
        {THEME_LABELS[theme] ?? theme}.
      </p>

      <div className="updev-actions">
        <button type="button" className="updev-ghost" data-testid="devtools-reset" onClick={reset}>
          Reset to default
        </button>
        <button type="button" className="updev-ghost" data-testid="devtools-lock" onClick={lock}>
          Lock
        </button>
      </div>
    </div>
  )
}
