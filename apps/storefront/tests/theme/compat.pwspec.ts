import { expect, test, type Page } from "@playwright/test"

/**
 * T0h.5 — the proof that moving the storefront onto canon tokens moved no pixels.
 *
 * The comparison is bridge-OFF against bridge-ON, both taken from the SAME running
 * storefront, rather than a screenshot taken before the change against one taken after.
 * That is deliberate. This worktree is shared with two other agents who are editing
 * src/modules and src/lib/profile while this runs; a baseline captured an hour ago would
 * be measuring their work as much as mine. `[data-theme-bridge="off"]` on <html> disables
 * every bridge declaration (see scripts/build-themes.mjs), which hands the page back to
 * the raw @medusajs/ui-preset variables — the exact state of the CSS before this step.
 *
 * The control side also re-injects the two declarations this step removed from
 * globals.css, so "before" really is what the storefront rendered yesterday and not
 * "yesterday minus the WCAG correction".
 *
 * Three passes, because one number alone cannot be read:
 *   THEME_COMPARE=vendor  --update-snapshots   writes the control baseline
 *   THEME_COMPARE=vendor                       run-to-run noise floor (must be ~0)
 *   THEME_COMPARE=bridge                       the number that matters (<= 0.1 %)
 */

const MODE = process.env.THEME_COMPARE === "vendor" ? "vendor" : "bridge"

/** The :root override that globals.css carried until this step; see medusa.theme.json --link. */
const LEGACY_WCAG_OVERRIDE = `:root{--fg-interactive:rgba(37, 99, 235, 1);--fg-interactive-hover:rgba(29, 78, 216, 1);}`

const PAGES: Record<string, string> = {
  home: process.env.THEME_PAGE_HOME ?? "/en",
  category: process.env.THEME_PAGE_CATEGORY ?? "/en/categories/shirts",
  pdp: process.env.THEME_PAGE_PDP ?? "/en/products/t-shirt",
  cart: process.env.THEME_PAGE_CART ?? "/en/cart",
}

/**
 * Sets the attribute before the page's own scripts and before the first paint.
 * addInitScript can run before <html> exists, so the observer covers that case.
 */
async function forceBridgeOff(page: Page) {
  await page.addInitScript(() => {
    const off = () => {
      const el = document.documentElement
      if (!el) return false
      el.setAttribute("data-theme-bridge", "off")
      return true
    }
    if (!off()) {
      new MutationObserver((_records, observer) => {
        if (off()) observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    }
  })
}

/**
 * Product photos are fetched from medusa-public-images.s3.eu-* through next/image. They
 * are remote, slow and not always decoded by the time the page is otherwise still:
 * measured, two runs of the SAME PDP with no CSS change differed by 50066 px (4.9 %),
 * all of it inside the gallery, because one run had the photo and the other the
 * placeholder. Every image is therefore served as one transparent pixel, identically in
 * both passes. Layout is untouched (next/image sizes the box from its props), and a
 * transparent pixel shows the themed surface behind it — which is the thing under test.
 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

async function stubImages(page: Page) {
  await page.route(/(\/_next\/image|\.(png|jpe?g|webp|avif|gif)(\?|$))/i, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG })
  )
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  // `networkidle` is not enough on a dev server: the HMR socket never goes quiet, and
  // the PDP's thumbnail rail decodes its images afterwards. Measured: without this wait
  // two runs of the SAME page differed by 5526 px (0.54 %) purely in those thumbnails.
  await page
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 20_000 })
    .catch(() => {
      /* an image that never loads is still a stable pixel; carry on */
    })
  await page.waitForTimeout(2000)
}

/**
 * Two things on these pages are not the theme's, and both move between runs:
 *
 *   - Next's dev-mode issue indicator, a floating badge inside a <nextjs-portal> shadow
 *     root. `mask` cannot cover it: the host element has no box of its own, so the mask
 *     rectangle comes out empty. It is hidden with CSS instead, in BOTH passes.
 *   - the promo strip, whose copy comes from the store profile another agent is
 *     regenerating while this suite runs. Measured: the baseline read "Free shipping
 *     over $120", the next run "Full-featured production ready DTC starter". Masking it
 *     keeps the number about the bridge; the mask covers only that strip, so every other
 *     colour on the page is still compared.
 */
const HIDE_UNSTABLE = `nextjs-portal{display:none !important}`
const promoStrip = (page: Page) => page.locator('[data-testid="promo-banner"]')

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name}: the bridge renders what the vendor preset rendered`, async ({ page }) => {
    await stubImages(page)
    if (MODE === "vendor") await forceBridgeOff(page)
    const response = await page.goto(path, { waitUntil: "networkidle" })
    expect(response?.status(), `${path} must render before it can be compared`).toBeLessThan(400)
    if (MODE === "vendor") await page.addStyleTag({ content: LEGACY_WCAG_OVERRIDE })
    await page.addStyleTag({ content: HIDE_UNSTABLE })
    await settle(page)

    // threshold 0: a single channel off by 1 counts as a differing pixel. The generous
    // default (0.2 YIQ) would hide exactly the small colour drift a bridge introduces.
    await expect(page).toHaveScreenshot(`${name}.png`, {
      // acceptance is 0.1 % of 1280x800 = 1024 px. THEME_MAX_DIFF_PIXELS=0 turns the
      // same run into a MEASUREMENT: any non-zero difference then fails and Playwright
      // prints the exact pixel count, which a passing run never does.
      ...(process.env.THEME_MAX_DIFF_PIXELS !== undefined
        ? { maxDiffPixels: Number(process.env.THEME_MAX_DIFF_PIXELS) }
        : { maxDiffPixelRatio: 0.001 }),
      threshold: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      mask: [promoStrip(page)],
    })
  })
}

test("flipping data-theme changes the canon tokens and the page background", async ({ page }) => {
  await page.goto(PAGES.home, { waitUntil: "domcontentloaded" })

  const read = () =>
    page.evaluate(() => {
      const html = document.documentElement
      const style = getComputedStyle(html)
      return {
        theme: html.getAttribute("data-theme"),
        mode: html.getAttribute("data-mode"),
        background: style.getPropertyValue("--background").trim(),
        foreground: style.getPropertyValue("--foreground").trim(),
        bgBase: style.getPropertyValue("--bg-base").trim(),
        htmlBg: style.backgroundColor,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }
    })

  const set = (theme: string, mode: string) =>
    page.evaluate(
      ([t, m]) => {
        document.documentElement.setAttribute("data-theme", t)
        document.documentElement.setAttribute("data-mode", m)
      },
      [theme, mode]
    )

  await set("medusa", "light")
  const medusaLight = await read()
  expect(medusaLight.background).toBe("rgba(255, 255, 255, 1)")
  expect(medusaLight.bgBase, "--bg-base is a mapped row: it must equal --background").toBe(medusaLight.background)

  await set("geist", "light")
  const geistLight = await read()
  expect(geistLight.background, "flipping data-theme must change --background").not.toBe(medusaLight.background)
  expect(geistLight.background).toBe("#ffffff")
  expect(geistLight.foreground).toBe("#171717")

  await set("geist", "dark")
  const geistDark = await read()
  expect(geistDark.background).toBe("#0a0a0a")
  expect(geistDark.background, "flipping data-mode must change --background").not.toBe(geistLight.background)
  // the bridge is what carries the change into what the page actually paints
  expect(geistDark.htmlBg, "the html background must follow the preset").not.toBe(medusaLight.htmlBg)
  expect(geistDark.htmlBg).toBe("rgb(10, 10, 10)")
  // body has no background of its own, so it shows the html one; assert it is not
  // painting an opaque colour of its own over the theme
  expect(["rgba(0, 0, 0, 0)", geistDark.htmlBg]).toContain(geistDark.bodyBg)
})

test("the pre-paint script has already set the attributes at DOMContentLoaded", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const html = document.documentElement
      ;(window as unknown as { __atDcl: unknown }).__atDcl = {
        theme: html.getAttribute("data-theme"),
        mode: html.getAttribute("data-mode"),
      }
    })
    try {
      localStorage.setItem("upready-store.theme", "geist")
      localStorage.setItem("upready-store.mode", "dark")
    } catch {
      /* the assertion below will fail loudly if the write did not land */
    }
  })
  await page.goto(PAGES.home, { waitUntil: "domcontentloaded" })
  const atDcl = await page.evaluate(() => (window as unknown as { __atDcl: { theme: string; mode: string } }).__atDcl)
  expect(atDcl, "no DOMContentLoaded observation was recorded").toBeTruthy()
  expect(atDcl.theme, "the stored preset must be on <html> before the first paint").toBe("geist")
  expect(atDcl.mode).toBe("dark")
})
