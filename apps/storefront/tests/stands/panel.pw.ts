import { expect, test } from "@playwright/test"

import {
  DARK_TARGET,
  LIGHT_TARGET,
  PROFILE_DEFAULTS,
  TARGET_MARKERS,
  assertNoHeadingOverflow,
  assertNoRawIdentifiers,
  currentProfile,
  getSettings,
  holdBrand,
  unlockStudio,
  withRestoredComposition,
} from "./helpers"

/**
 * Scenario 1 (task order t-2026-09-09-02): the hidden panel saves a default mode and
 * a composition for ALL visitors, and a private window shows exactly that with no
 * flash. Opened the way a real visitor does — a 2s press on the logo, then the
 * password — per this package's own instructions; the API round trip
 * (getSettings/putSettings) is used only to read the BEFORE document and to restore
 * it in `finally`, never to fake the save itself.
 */

const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD ?? "upready-panel-2026"

// The proxy answers with updatedAt on top of the document; the comparison below is about the
// document the operator chose, not about the timestamp.
const stripUpdatedAt = (settings: (Record<string, unknown> & { updatedAt?: string }) | null) => {
  if (!settings) return settings
  const { updatedAt: _updatedAt, ...rest } = settings
  return rest
}

test.describe("panel-composition", () => {
  test("saving a mode + composition for all visitors renders for a fresh browser with no flash", async ({
    page,
    context,
    browser,
  }) => {
    await unlockStudio(context)

    const before = await getSettings(context.request)
    expect(
      before.secretConfigured,
      "STOREFRONT_SETTINGS_SECRET must be configured on this stand for the panel's Save button to appear at all"
    ).toBe(true)

    const effectiveMode = before.settings?.defaultMode ?? PROFILE_DEFAULTS[currentProfile()].defaultMode
    const targetMode: "light" | "dark" = effectiveMode === "dark" ? "light" : "dark"
    const target = targetMode === "light" ? LIGHT_TARGET : DARK_TARGET

    await withRestoredComposition(context, async () => {
      await page.goto("/en")
      await holdBrand(page, 2200)
      await expect(page.getByTestId("studio-unlock-dialog")).toBeVisible()
      await page.getByTestId("studio-password").fill(STUDIO_PASSWORD)
      await page.getByTestId("studio-unlock-submit").click()
      await expect(page.getByTestId("studio-button")).toBeVisible()

      await page.getByTestId("studio-button").click()
      await expect(page.getByTestId("studio-popover")).toBeVisible()

      const rows: Array<[string, string]> = [
        ["header", target.header],
        ["hero", target.hero],
        ["tiles", target.tiles],
        ["listing", target.listing],
        ["footer", target.footer],
      ]
      for (const [slug, value] of rows) {
        await page.getByTestId(`studio-slot-${slug}`).click()
        await page.getByTestId(`studio-slot-${slug}-option-${value}`).click()
      }
      // The default mode goes LAST: the contract forbids footer f6 with a dark default, and a
      // stand seeded with f6 (scruple, larchant) keeps the dark option disabled until the footer
      // pick above has moved away from f6 — picking the mode first waits on a disabled button.
      await page.getByTestId(`studio-default-mode-${targetMode}`).click()

      await expect(page.getByTestId("studio-composition-dirty")).toBeVisible()
      await page.getByTestId("studio-composition-save").click()
      // The button shows data-state="saved" for two seconds and then returns to idle
      // (popover.tsx), which a polling assertion can miss on a slow stand; the durable
      // evidence of a successful save is the dirty marker going away and the document the
      // proxy now serves being the one the operator chose.
      await expect(page.getByTestId("studio-composition-dirty")).toBeHidden({ timeout: 15_000 })
      await expect
        .poll(async () => stripUpdatedAt((await getSettings(context.request)).settings), { timeout: 15_000 })
        .toEqual(target)

      // A browser that has never visited this stand: no cookies, no localStorage —
      // exactly a private window. Checked two ways: the raw SSR response (proves the
      // mode is right BEFORE any client script runs, i.e. no flash is even possible),
      // then a real page load for the composition's own visible testids.
      const freshContext = await browser.newContext()
      const rawRes = await freshContext.request.get("/en")
      expect(rawRes.status()).toBe(200)
      const rawHtml = await rawRes.text()
      expect(rawHtml).toMatch(new RegExp(`<html[^>]*data-mode="${target.defaultMode}"`))

      const freshPage = await freshContext.newPage()
      await freshPage.goto("/en")
      expect(
        await freshPage.evaluate(() => document.documentElement.getAttribute("data-mode"))
      ).toBe(target.defaultMode)

      for (const marker of TARGET_MARKERS[targetMode]) {
        await expect(freshPage.getByTestId(marker)).toBeVisible()
      }
      if (target.tiles === "off") {
        await expect(freshPage.getByTestId("category-tiles")).toHaveCount(0)
      }

      await assertNoRawIdentifiers(freshPage)
      await freshContext.close()
    })
  })

  test("[@mobile] home headings do not overflow at 390px", async ({ page }) => {
    await page.goto("/en")
    await assertNoHeadingOverflow(page)
  })
})
