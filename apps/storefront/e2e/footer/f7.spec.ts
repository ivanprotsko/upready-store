import { expect, test } from "@playwright/test"
import { Client } from "pg"

/**
 * Footer F7, tenant cherkashino (t-2026-09-24-n1, step 6).
 *
 * F7 only renders once the tenant's saved `settings.footer` is `"f7"`
 * (`modules/layout/templates/footer/variants/index.ts`) — the owner panel's
 * own setting, not a build flag. cherkashino's own database row still has the
 * old `"f4"` (which the registry maps to the F1 placeholder, not a distinct
 * footer), so this suite writes the real setting itself before the first page
 * load, through `E2E_DATABASE_URL` — the isolated e2e clone, never the shared
 * stand (DATA SAFETY note in `playwright.config.ts`). Writing straight to
 * `tenant_home_config` is the same row `PUT /tenants/home` would update; doing
 * it here skips only the owner's login, which this suite has no session for.
 */

const DATABASE_URL = process.env.E2E_DATABASE_URL
const REVALIDATE_SECRET = process.env.E2E_REVALIDATE_SECRET
const TENANT_HANDLE = "cherkashino"

test.skip(
  !DATABASE_URL,
  "E2E_DATABASE_URL is not set — point it at the isolated e2e database clone, never the shared stand"
)

test.beforeAll(async ({ baseURL }) => {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    const result = await client.query(
      `UPDATE tenant_home_config
         SET config = jsonb_set(config, '{settings,footer}', '"f7"')
       WHERE tenant_id = (SELECT id FROM tenant WHERE handle = $1)
       RETURNING tenant_id`,
      [TENANT_HANDLE]
    )
    if (result.rowCount !== 1) {
      throw new Error(
        `expected exactly one tenant_home_config row for handle "${TENANT_HANDLE}", got ${result.rowCount}`
      )
    }
  } finally {
    await client.end()
  }

  // The write above bypasses the owner panel's own save, which is what would
  // normally call this same route (`app/api/revalidate/route.ts`): a plain SQL
  // UPDATE does not touch Next's `force-cache` data cache, and any earlier
  // page load in this process (the cart suite runs first) already cached the
  // OLD footer under the `tenant-home-<handle>` tag. Without this call the
  // test below would read that stale cache and never see "f7" at all.
  const response = await fetch(new URL("/api/revalidate", baseURL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(REVALIDATE_SECRET ? { "x-revalidate-secret": REVALIDATE_SECRET } : {}),
    },
    body: JSON.stringify({ type: "tenant.home", handle: TENANT_HANDLE }),
  })
  if (!response.ok) {
    throw new Error(`POST /api/revalidate failed: ${response.status} ${await response.text()}`)
  }
})

test("footer f7 renders once the owner panel setting is switched, on the e2e database only", async ({
  page,
}) => {
  await page.goto("/ru", { waitUntil: "domcontentloaded" })

  // F1 (the "f4" placeholder cherkashino's row still had before this test's
  // own beforeAll) has neither of these rows — they are F7-specific.
  await expect(page.locator("[data-testid=footer-badges]")).toBeVisible()
  await expect(page.locator("[data-testid=footer-requisites-line]")).toBeVisible()

  await expect(page).toHaveScreenshot("footer-f7.png", { fullPage: true })
})
