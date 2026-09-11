import { expect, test, type Page } from "@playwright/test"

/**
 * Acceptance screenshots for Ivan's eyes (rule 27d): one frame per state of the mock-up,
 * taken on the live stand rather than drawn. Skipped unless STUDIO_SHOTS is set, so the
 * ordinary test run does not write PNGs.
 *
 * Output: artifacts/docs/stands/studio-*.png (PNG stays out of git — rule 21f).
 */

const PASSWORD = process.env.STUDIO_PASSWORD ?? "t0i-panel-2026"
const OUT = "../../artifacts/docs/stands"

test.skip(!process.env.STUDIO_SHOTS, "set STUDIO_SHOTS=1 to write the acceptance frames")

async function holdBrand(page: Page, ms: number) {
  const brand = page.getByTestId("nav-store-link")
  const box = await brand.boundingBox()
  if (!box) throw new Error("brand link has no box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test("acceptance frames", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })

  // S0 — the visitor's storefront
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await page.screenshot({ path: `${OUT}/studio-s0-visitor.png` })

  // S2 — the password dialog
  await holdBrand(page, 2400)
  await expect(page.getByTestId("studio-unlock-dialog")).toBeVisible()
  await page.screenshot({ path: `${OUT}/studio-s2-dialog.png` })

  // S3 — a wrong password
  await page.getByTestId("studio-password").fill("not-the-password")
  await page.getByTestId("studio-unlock-submit").click()
  await expect(page.getByTestId("studio-unlock-error")).toBeVisible()
  await page.screenshot({ path: `${OUT}/studio-s3-wrong-password.png` })

  // S4 — unlocked: the floating button
  await page.getByTestId("studio-password").fill(PASSWORD)
  await page.getByTestId("studio-unlock-submit").click()
  await expect(page.getByTestId("studio-button")).toBeVisible()
  await page.waitForLoadState("networkidle")
  await page.screenshot({ path: `${OUT}/studio-s4-button.png` })

  // S5 — the popover, on the default look
  await page.getByTestId("studio-button").click()
  await expect(page.getByTestId("studio-popover")).toBeVisible()
  await page.screenshot({ path: `${OUT}/studio-s5-popover.png` })

  // S6 — a preset flip: the shop changes, the panel does not
  await page.getByTestId("studio-preset-supplements").click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/studio-s6-preset-scruple.png` })

  await page.getByTestId("studio-preset-womens-fashion").click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/studio-s6-preset-larchant.png` })

  // S7 — dark mode, panel included
  await page.getByTestId("studio-mode-dark").click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/studio-s7-dark.png` })

  // S8 — reset is the old look again
  await page.getByTestId("studio-reset").click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/studio-s8-reset.png` })

  // S11 — the same panel at phone width
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/studio-s11-mobile.png` })
})
