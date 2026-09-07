import { expect, test } from "@playwright/test"

import fixture from "./fixtures/profiles/testshop/profile.json"

const hero = fixture.home.hero

/**
 * The hero renders the profile's headline and layout — frames 1 and 2 of
 * artifacts/docs/2026-09-07-profile-home-mockup.md. Everything asserted here comes out of
 * profile.json, so a hardcoded string in the component would fail the run.
 */
test.describe("profile hero", () => {
  test("renders the headline from the profile", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("profile-hero-headline")).toHaveText(hero.headline)
  })

  test("renders the subheadline and the CTA from the profile", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(hero.subheadline, { exact: true })).toBeVisible()
    const cta = page.getByTestId("profile-hero-cta")
    await expect(cta).toHaveText(hero.cta.label)
    await expect(cta).toHaveAttribute("href", hero.cta.href)
  })

  test("uses the layout the profile asks for", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("profile-hero")).toHaveAttribute(
      "data-hero-layout",
      hero.layout
    )
  })

  // `priority` emits a preload link in a production build, but in dev its only observable
  // effect on the element is that next/image leaves off loading="lazy" — measured on this
  // page: 8 lazy images below the fold, 0 in the hero.
  test("loads the hero image eagerly while the images below it stay lazy", async ({ page }) => {
    await page.goto("/")
    const heroImg = page.getByTestId("profile-hero").locator("img").first()
    await expect(heroImg).not.toHaveAttribute("loading", "lazy")

    const lazyBelow = await page.locator('img[loading="lazy"]').count()
    expect(lazyBelow).toBeGreaterThan(0)
  })
})
