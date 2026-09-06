import {expect, test} from "@playwright/test"

// Proves the runner itself: a browser really starts in this environment and the
// container can reach the host. Everything else in tests/ui-lab assumes both.
test("chromium starts and renders", async ({page}) => {
  await page.setContent("<main id='probe' style='width:120px;height:40px'>ok</main>")
  const box = await page.locator("#probe").boundingBox()
  expect(box?.width).toBe(120)
})

test("the runner reaches the host backend", async ({request}) => {
  const backend = process.env.SMOKE_BACKEND_URL ?? "http://host.docker.internal:9022/health"
  const response = await request.get(backend)
  expect(response.status()).toBe(200)
})
