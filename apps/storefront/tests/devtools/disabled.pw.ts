import { expect, test } from "@playwright/test"

/**
 * The other half of T0i's acceptance: a storefront started WITHOUT
 * STOREFRONT_DEVTOOLS_PASSWORD must behave as if the feature had never been written.
 *
 * It runs as its own pass, against the same stand restarted with the variable empty —
 * a second Next dev server out of the same directory would share .next with the first
 * and measure something that is not the product.
 *
 * Runner (from apps/storefront, stand restarted with STOREFRONT_DEVTOOLS_PASSWORD=):
 *   DEVTOOLS_URL=http://host.docker.internal:8000 pnpm test:devtools tests/devtools/disabled.pw.ts
 */

test.describe("storefront with the feature switched off", () => {
  test("the unlock route answers 404 to a POST", async ({ request }) => {
    const res = await request.post("/api/devtools/unlock", { data: { password: "anything" } })
    expect(res.status()).toBe(404)
  })

  test("the unlock route answers 404 to a DELETE", async ({ request }) => {
    const res = await request.delete("/api/devtools/unlock")
    expect(res.status()).toBe(404)
  })

  test("the home page carries no devtools markup", async ({ request }) => {
    const res = await request.get("/")
    const html = await res.text()
    expect(res.status()).toBe(200)
    expect(html).not.toContain('data-testid="devtools-button"')
    expect(html).not.toContain('data-testid="devtools-root"')
  })

  test("holding the logo says the tool is not available here", async ({ page }) => {
    await page.goto("/")
    const brand = page.getByTestId("nav-store-link")
    const box = await brand.boundingBox()
    if (!box) throw new Error("brand link has no box")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(2400)
    await page.mouse.up()

    await page.getByTestId("devtools-password").fill("anything")
    await page.getByTestId("devtools-unlock-submit").click()
    await expect(page.getByTestId("devtools-unlock-error")).toContainText("not available")

    await page.reload()
    await expect(page.getByTestId("devtools-button")).toHaveCount(0)
  })
})
