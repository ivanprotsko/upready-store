import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ModeLockProvider } from "@lib/theme/mode-lock"

import ModeToggle from "."

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

/**
 * The visitor's light/dark switch is offered only where the palette has both modes
 * (t-2026-10-12-33 T0c): on a light-only palette the root layout locks the mode and every
 * call site (the headers, the side menu, the category menu, the bottom bar) draws nothing.
 */
describe("ModeToggle", () => {
  const toggle = <ModeToggle data-testid="nav-mode-toggle" className="probe" />

  it("is drawn on a page with no lock, as it was before templates", () => {
    expect(renderToStaticMarkup(toggle)).toMatch(/^<button type="button" aria-label="modeToggleDark" data-testid="nav-mode-toggle" class="probe">/)
    expect(renderToStaticMarkup(<ModeLockProvider locked={false}>{toggle}</ModeLockProvider>)).toBe(renderToStaticMarkup(toggle))
  })

  it("draws nothing while the mode is locked", () => {
    expect(renderToStaticMarkup(<ModeLockProvider locked>{toggle}</ModeLockProvider>)).toBe("")
  })
})
