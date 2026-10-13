import { isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { themePrePaintScript } from "@lib/theme"
import { ModeLockProvider } from "@lib/theme/mode-lock"

import RootLayout from "./layout"

/**
 * The root layout's mode (t-2026-10-12-33 T0c). A light-only palette has no dark tokens, but
 * `globals.css` keeps its own `[data-mode="dark"]` rules (the cart, the field focus ring, the
 * Yandex button, the dark logo): on such a palette the page is light whatever the template, the
 * shop or the visitor say, and the switch is not offered. Every other page keeps the mode it had.
 *
 * Async Server Component, so no renderer: `await RootLayout()` returns the element tree, and every
 * loader it reads is mocked.
 */

const state = vi.hoisted(() => ({
  template: null as { preset: string; mode: string } | null,
  tenantMode: null as string | null,
}))

vi.mock("styles/globals.css", () => ({}))
vi.mock("next-intl", () => ({ NextIntlClientProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "ru" }))
vi.mock("@lib/theme/olavka-fonts", () => ({ olavkaFontClassName: "" }))
vi.mock("@lib/data/cookies", () => ({ getRequestBaseURL: async () => "https://shop.test" }))
vi.mock("@lib/data/olavka-shop", () => ({ isOlavkaShop: async () => false }))
vi.mock("@lib/data/analytics", () => ({
  getTenantAnalytics: async () => ({ ga4MeasurementId: null, yandexMetricaId: null }),
}))
vi.mock("@lib/data/client-messages", () => ({ getClientMessages: async () => ({}) }))
vi.mock("@lib/data/tenant-branding", () => ({ getSiteBranding: async () => ({}) }))
vi.mock("@lib/data/tenant-test-mode", () => ({ getSiteTestMode: async () => null }))
vi.mock("@lib/data/tenant-home", () => ({
  getEffectiveSettings: async () => null,
  getTenantThemePreset: async () => null,
  getTenantModeDefault: async () => state.tenantMode,
}))
vi.mock("@lib/templates/active", () => ({
  getActiveTemplate: async () =>
    state.template && { ...state.template, style: {}, fonts: { pair: null, loaded: false } },
}))
vi.mock("@modules/common/components/analytics", () => ({ default: () => null }))
vi.mock("@modules/studio/components/studio-mount", () => ({ default: () => null }))
vi.mock("@modules/common/components/test-mode-dot", () => ({ default: () => null }))
vi.mock("@modules/telegram/components/mini-app-bridge", () => ({
  default: function MiniAppBridge() {
    return null
  },
}))

type Element = ReactElement<Record<string, unknown>>

/** Every element of the tree, depth first. */
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement(node)) return []
  const element = node as Element
  return [element, ...elements(element.props.children)]
}

async function render() {
  const html = (await RootLayout({ children: <p>page</p> })) as Element
  const all = elements(html)
  const script = all.find((e) => e.type === "script")
  const lock = all.find((e) => e.type === ModeLockProvider)
  const bridge = all.find((e) => typeof e.type === "function" && e.type.name === "MiniAppBridge")
  return {
    mode: html.props["data-mode"],
    theme: html.props["data-theme"],
    script: (script?.props.dangerouslySetInnerHTML as { __html: string } | undefined)?.__html,
    locked: lock?.props.locked,
    bridgeLocked: bridge?.props.modeLocked,
    pageInsideLock: elements(lock?.props.children).some((e) => e.type === "p"),
  }
}

describe("RootLayout", () => {
  beforeEach(() => {
    state.template = null
    state.tenantMode = null
  })

  it("paints a light-only palette light, keeps the stored mode off it and locks the switch", async () => {
    state.template = { preset: "ferma", mode: "dark" }
    state.tenantMode = "dark"
    const page = await render()
    expect(page.theme).toBe("ferma")
    expect(page.mode).toBe("light")
    expect(page.script).toBe(themePrePaintScript({ lightOnly: true }))
    expect(page.locked).toBe(true)
    expect(page.pageInsideLock).toBe(true)
    expect(page.bridgeLocked).toBe(true)
  })

  it("keeps the template's dark mode on a palette that has one", async () => {
    state.template = { preset: "electronics", mode: "dark" }
    const page = await render()
    expect(page.mode).toBe("dark")
    expect(page.script).toBe(themePrePaintScript())
    expect(page.locked).toBe(false)
    expect(page.bridgeLocked).toBe(false)
  })

  it("leaves a shop with no template as it was: its own mode, today's script, the switch", async () => {
    state.tenantMode = "dark"
    const page = await render()
    expect(page.mode).toBe("dark")
    expect(page.script).toBe(themePrePaintScript())
    expect(page.locked).toBe(false)
    expect(page.bridgeLocked).toBe(false)
  })
})
