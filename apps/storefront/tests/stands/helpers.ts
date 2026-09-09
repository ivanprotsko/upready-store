import { readFileSync } from "fs"
import path from "path"
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Shared fixtures for the wave-3 stand scenarios (tests/stands/*.pw.ts). Every helper
 * here drives the LIVE product the way a visitor or the demo customer would — the
 * hidden panel through its own unlock route, checkout through its real forms, login
 * through the real /en/account form. Nothing here reaches into React state or mocks a
 * response; it is the same contract tests/devtools/panel.pw.ts already exercises,
 * extended to the composition/checkout/account surface wave 2 shipped.
 *
 * Contracts read from (not re-derived at runtime, since this is a test fixture, not
 * product code — duplicating a handful of literal enums here carries no risk the way
 * duplicating them inside the app would):
 *   .ai/reports/{P-panel,pickup,P-checkout-states,account,I-integrate}.json
 *   src/lib/theme/composition.ts (HEADER_KEYS/HERO_KEYS/TILES_KEYS/LISTING_KEYS/
 *     FOOTER_KEYS, PROFILE_DEFAULTS, the two FORBIDDEN pairs)
 */

export const DEVTOOLS_PASSWORD = process.env.DEVTOOLS_PASSWORD ?? "upready-panel-2026"
export const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL ?? "user@upready.dev"
export const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD ?? "supersecret"

// ── composition (mirrors src/lib/theme/composition.ts's own runtime contract) ──────

export type ProfileId =
  | "sneakers"
  | "electronics"
  | "supplements"
  | "womens-fashion"
  | "home-goods"

export type CompositionDoc = {
  defaultMode: "light" | "dark"
  header: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  hero: "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb"
  tiles: "on" | "off"
  listing: "none" | "p1" | "p2" | "p3" | "p4" | "p5"
  footer: "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"
}

/** composition.ts's PROFILE_DEFAULTS, transcribed for the profile this stand runs. */
export const PROFILE_DEFAULTS: Record<ProfileId, CompositionDoc> = {
  sneakers: { defaultMode: "dark", header: "h5", hero: "k", tiles: "off", listing: "p2", footer: "f3" },
  electronics: { defaultMode: "dark", header: "h3", hero: "k", tiles: "on", listing: "p3", footer: "f5" },
  supplements: { defaultMode: "light", header: "h6", hero: "k", tiles: "off", listing: "p3", footer: "f6" },
  "womens-fashion": { defaultMode: "light", header: "h6", hero: "g", tiles: "off", listing: "p4", footer: "f6" },
  "home-goods": { defaultMode: "light", header: "h2", hero: "h", tiles: "on", listing: "p4", footer: "f4" },
}

const PROFILE_BY_HOST: Record<string, ProfileId> = {
  "kerbstone.upready.dev": "sneakers",
  "ferrite.upready.dev": "electronics",
  "scruple.upready.dev": "supplements",
  "larchant.upready.dev": "womens-fashion",
  "long-morning.upready.dev": "home-goods",
}

/** Best-effort profile id for the stand under test, from STAND_URL's own hostname. */
export function currentProfile(): ProfileId {
  try {
    const host = new URL(process.env.STAND_URL ?? "").hostname
    return PROFILE_BY_HOST[host] ?? "sneakers"
  } catch {
    return "sneakers"
  }
}

/** The stand's own short name (the label used everywhere in the task order), from STAND_URL's hostname. */
export function currentStandSlug(): string {
  try {
    const host = new URL(process.env.STAND_URL ?? "").hostname
    return host.split(".")[0] || "stand"
  } catch {
    return "stand"
  }
}

// ── mode axis (mirrors src/lib/theme/attributes.ts's own AXES registry) ────────────

/** The localStorage key attributes.ts persists data-mode under. Kept as a literal
 * here (not imported) for the same reason PROFILE_DEFAULTS above is transcribed: this
 * is a test fixture reading the app's contract, not app code that must never drift
 * from its own source of truth. */
export const MODE_STORAGE_KEY = "upready-store.mode"

/**
 * Arranges for `page` to carry the given light/dark mode from its very first paint,
 * on every navigation the page makes from here on — `addInitScript` re-runs before
 * every new document, which is what a real visitor's already-set localStorage would
 * do too, and it is set before any `goto()`, so there is no flash of the other mode.
 */
export async function setModeBeforeNav(page: Page, mode: "light" | "dark") {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // a private window forgets the choice; this run's screenshot still uses it
      }
    },
    [MODE_STORAGE_KEY, mode] as const
  )
}

/**
 * Two known-good, mutually exclusive composition docs — measured live by I-integrate
 * (.ai/reports/I-integrate.json "runtimeSmoke"), each avoiding both FORBIDDEN pairs
 * (header h4 + hero k; footer f6 + defaultMode dark) regardless of which one a stand's
 * OWN saved document already matches, so "set defaultMode to the OTHER mode" always
 * has a safe target composition to move to.
 */
export const LIGHT_TARGET: CompositionDoc = {
  defaultMode: "light",
  header: "h1",
  hero: "k",
  tiles: "on",
  listing: "p1",
  footer: "f1",
}
export const DARK_TARGET: CompositionDoc = {
  defaultMode: "dark",
  header: "h3",
  hero: "g",
  tiles: "off",
  listing: "p4",
  footer: "f1",
}

/** The testid the saved composition above renders, keyed off which target was saved. */
export const TARGET_MARKERS: Record<"light" | "dark", string[]> = {
  light: ["home-listing-p1", "category-tiles", "nav-menu-button"],
  dark: ["home-hero-g", "home-listing-p4", "nav-all-products-link", "nav-service-message"],
}

type GetSettingsResponse = {
  settings: (CompositionDoc & { updatedAt: string }) | null
  secretConfigured: boolean
  loadError?: boolean
}

/** Reads the panel's own document through the same proxy the popover calls. */
export async function getSettings(request: APIRequestContext): Promise<GetSettingsResponse> {
  const res = await request.get("/api/devtools/settings")
  if (!res.ok()) throw new Error(`GET /api/devtools/settings -> ${res.status()}`)
  return res.json()
}

/** Writes a composition doc through the same proxy the popover's Save button calls. */
export async function putSettings(request: APIRequestContext, doc: CompositionDoc) {
  return request.put("/api/devtools/settings", { data: doc })
}

/**
 * Unlocks the hidden panel through the real route and leaves the resulting httpOnly
 * cookie on `context` — every `page`/`request` made from this context afterwards
 * carries it, the same way a real browser would after the password dialog succeeds.
 */
export async function unlockDevtools(context: BrowserContext) {
  const res = await context.request.post("/api/devtools/unlock", {
    data: { password: DEVTOOLS_PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`POST /api/devtools/unlock -> ${res.status()} (check DEVTOOLS_PASSWORD)`)
  }
}

/** Press and hold the desktop brand link for `ms`, then release — opens the panel's password dialog at 2s. */
export async function holdBrand(page: Page, ms = 2200) {
  const brand = page.getByTestId("nav-store-link")
  await expect(brand).toBeVisible()
  const box = await brand.boundingBox()
  if (!box) throw new Error("brand link has no bounding box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/**
 * Runs `mutate` in a try/finally that always restores the settings document this
 * stand carried before the test touched it (rule: never leave a stand changed). When
 * nothing was saved yet (`settings === null`), there is no prior document to restore —
 * the closest equivalent is the profile's own built-in default, which is exactly what
 * an absent document already renders as, so writing it back leaves visitor-visible
 * behaviour unchanged even though `settings` itself is no longer literally null.
 */
export async function withRestoredComposition(
  context: BrowserContext,
  run: () => Promise<void>
) {
  const before = await getSettings(context.request)
  try {
    await run()
  } finally {
    const restoreDoc: CompositionDoc = before.settings
      ? {
          defaultMode: before.settings.defaultMode,
          header: before.settings.header,
          hero: before.settings.hero,
          tiles: before.settings.tiles,
          listing: before.settings.listing,
          footer: before.settings.footer,
        }
      : PROFILE_DEFAULTS[currentProfile()]
    await putSettings(context.request, restoreDoc)
  }
}

// ── customer ─────────────────────────────────────────────────────────────────────

/** Logs the demo customer in through the real /en/account login form. */
export async function loginCustomer(page: Page) {
  await page.goto("/en/account")
  const emailInput = page.getByTestId("email-input")
  if (await emailInput.count() === 0) {
    // already logged in from a previous step on this same page/context
    return
  }
  await emailInput.fill(CUSTOMER_EMAIL)
  await page.getByTestId("password-input").fill(CUSTOMER_PASSWORD)
  await page.getByTestId("sign-in-button").click()
  await expect(page.getByTestId("overview-page-wrapper")).toBeVisible({ timeout: 20_000 })
}

// ── cart ─────────────────────────────────────────────────────────────────────────

/** Navigates to the store listing and waits for its grid — the first stage of addFirstProductToCart, split out so frames.pw.ts can screenshot the PLP before moving on. */
export async function goToStore(page: Page) {
  await page.goto("/en/store")
  await expect(page.getByTestId("products-list")).toBeVisible({ timeout: 20_000 })
}

/** Opens the first product from an already-loaded store listing — second stage, split out so frames.pw.ts can screenshot the PDP before adding to cart. */
export async function openFirstProduct(page: Page) {
  // Not product-wrapper itself: its card overlays quick-select size/colour chips
  // over most of that div's own box, so a plain .click() (centre-of-bounding-box)
  // can land on a chip instead of the surrounding <Link> — measured against
  // kerbstone 2026-09-10. product-title sits above those chips and is always part
  // of the same <Link>.
  await page.getByTestId("product-title").first().click()
  await expect(page.getByTestId("product-container")).toBeVisible({ timeout: 20_000 })
}

/** Adds the already-open product page to the cart — third stage, split out of addFirstProductToCart for the same reason as the two above. */
export async function addOpenProductToCart(page: Page) {
  // Multi-variant products need one option picked per option group before the add
  // button enables; a single-variant product preselects itself (product-actions/
  // index.tsx's own "If there is only 1 variant, preselect the options" effect).
  // Retried: a click made the instant the SSR'd button appears can land before this
  // page's own React hydrates and attaches its onClick (the button is already in the
  // DOM from the server, plausible-looking but inert) — measured against kerbstone
  // 2026-09-10, where a first pass of clicks left every option unselected.
  const addButton = page.getByTestId("add-product-button")
  const optionGroups = page.getByTestId("product-options")
  const groupCount = await optionGroups.count()

  for (let attempt = 0; attempt < 5 && !(await addButton.isEnabled()); attempt += 1) {
    for (let i = 0; i < groupCount; i += 1) {
      const firstEnabled = optionGroups
        .nth(i)
        .locator('[data-testid="option-button"]:not([disabled])')
        .first()
      if ((await firstEnabled.count()) > 0) await firstEnabled.click()
    }
    await page.waitForTimeout(400)
  }

  await expect(addButton).toBeEnabled({ timeout: 10_000 })
  await addButton.click()
  // the button's own isLoading spinner clears once the server action resolves
  await expect(addButton).toBeEnabled({ timeout: 20_000 })
}

/** Adds the first purchasable product to the cart through the real store + product page. */
export async function addFirstProductToCart(page: Page) {
  await goToStore(page)
  await openFirstProduct(page)
  await addOpenProductToCart(page)
}

// ── checkout ─────────────────────────────────────────────────────────────────────

/**
 * Opens the contacts sheet and fills email/name/phone, the way a visitor would before
 * shipping. Waits on the sheet's own INPUT, never the wrapping `role="dialog"` element:
 * that wrapper (`<Dialog className="relative z-50">`, headlessui) carries no size of
 * its own — its backdrop and panel are `fixed inset-0` children that escape its box —
 * so Playwright's own `toBeVisible()` (which requires a non-empty bounding box) reads
 * it as hidden even while the sheet is fully painted on screen (measured against
 * kerbstone 2026-09-10, screenshot showed the sheet open and legible at the exact
 * moment the assertion on the wrapper timed out).
 */
export async function fillCheckoutContacts(
  page: Page,
  contact: { firstName: string; lastName: string; email: string; phone: string }
) {
  await page.getByTestId("checkout-contacts-row").click()
  const firstName = page.getByTestId("shipping-first-name-input")
  await expect(firstName).toBeVisible()
  await firstName.fill(contact.firstName)
  await page.getByTestId("shipping-last-name-input").fill(contact.lastName)
  await page.getByTestId("shipping-email-input").fill(contact.email)
  await page.getByTestId("shipping-phone-input").fill(contact.phone)
  await page.locator('form button[type="submit"]:visible').last().click()
  await expect(firstName).toBeHidden({ timeout: 25_000 })
}

/**
 * Opens the address sheet and fills a manual address (no saved address on a fresh
 * demo cart). The sheet's default address input (`AddressAutocomplete` ->
 * `PlainAddressInput`, no DaData token configured on any of these stands) is ONE
 * field, address_1 alone — city/postal/province only exist once the sheet's own
 * "Enter address manually" checkbox is checked (`ManualAddressFields`) — measured
 * against kerbstone 2026-09-10, where `input[name="city"]` never appeared at all
 * until that checkbox was ticked.
 */
export async function fillCheckoutAddress(
  page: Page,
  address: { address1: string; city: string; postalCode: string }
) {
  const row = page.getByTestId("checkout-address-row")
  if ((await row.count()) === 0) return // already on the pickup row (no address needed)
  await row.click()
  const addNew = page.getByRole("button", { name: /add a new address|add new address/i })
  if ((await addNew.count()) > 0 && (await addNew.isVisible())) await addNew.click()

  const manualToggle = page.getByText("Enter address manually")
  if ((await manualToggle.count()) > 0) await manualToggle.click()

  const address1Input = page.locator('input[name="address_1"]')
  await expect(address1Input).toBeVisible()
  await address1Input.fill(address.address1)
  const cityInput = page.locator('input[name="city"]')
  if ((await cityInput.count()) > 0) {
    await cityInput.fill(address.city)
    await page.locator('input[name="postal_code"]').fill(address.postalCode)
  }
  await page.locator('form button[type="submit"]:visible').last().click()
  await expect(address1Input).toBeHidden({ timeout: 25_000 })
}

/**
 * Selects the "Pickup" shipping card — opens the pickup-point sheet if no point is
 * chosen yet. Tries the testid the source names first (short wait); falls back to
 * the accessible role so a stand whose pickup fulfillment isn't wired the way
 * `isPickupShippingOption()` expects still gets a clear, fast diagnostic instead of
 * an opaque 120s test timeout (this is exactly the gap pickup.json's own "Seed
 * unverified live" blocker names).
 */
export async function selectPickupShipping(page: Page) {
  const byTestId = page.getByTestId("delivery-option-pickup")
  if ((await byTestId.count()) > 0) {
    await byTestId.click()
    return
  }
  const byRole = page.getByRole("radio", { name: /pickup/i })
  await expect(
    byRole,
    "no element carries data-testid=\"delivery-option-pickup\" and no radio named \"Pickup\" exists either"
  ).toHaveCount(1, { timeout: 10_000 })
  await byRole.click()
  const opened = page.getByTestId("pickup-point-list")
  const ok = await opened
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!ok) {
    throw new Error(
      "a radio named \"Pickup\" exists and was clicked, but no data-testid=\"delivery-option-pickup\" " +
        "and no pickup-point-list sheet opened within 10s — this looks like the OLD, non-functional " +
        "generic \"Pickup\" shipping option (isPickupShippingOption() reads false for it), not the " +
        "wave-2 seeded pickup fulfillment. See pickup.json's own recorded blocker: seeding was never " +
        "verified live."
    )
  }
}

/**
 * Picks whichever shipping method is quickest to complete — a plain courier card if
 * this profile's region has one, otherwise pickup (choosing the first seeded point).
 * Used by the card-outcome scenarios, which only need SOME valid shipping method
 * selected, not pickup specifically.
 */
export async function selectAnyShippingMethod(page: Page) {
  const courier = page.getByTestId("delivery-option-radio").first()
  if ((await courier.count()) > 0) {
    await courier.click()
    return
  }
  await selectPickupShipping(page)
  await choosePickupPoint(page)
}

/** Chooses a pickup point from the (already open) sheet, optionally searching first. */
export async function choosePickupPoint(page: Page, opts?: { search?: string }) {
  await expect(page.getByTestId("pickup-point-list")).toBeVisible({ timeout: 10_000 })
  if (opts?.search) {
    await page.getByTestId("pickup-point-search").fill(opts.search)
  }
  await page.getByTestId("pickup-point-choose").first().click()
}

/**
 * Selects the manual-provider payment chip — nothing is pre-selected on load
 * (`selectedPaymentMethod` starts from the cart's own payment session, which is
 * empty on a fresh cart), so the demo-card fields never render until this chip is
 * clicked, even though "Manual payment" is the only live provider on every stand.
 */
export async function selectManualPayment(page: Page) {
  await page.getByRole("button", { name: /manual/i }).first().click()
  await expect(page.getByTestId("demo-card-fields")).toBeVisible({ timeout: 10_000 })
}

const CARD_SUFFIX = { decline: "0000", redirect: "9999", approve: "4242" } as const

/** Fills the demo-card form for one of the three documented outcomes (decision F5). */
export async function fillDemoCard(page: Page, outcome: keyof typeof CARD_SUFFIX) {
  const number = `424242424242${CARD_SUFFIX[outcome]}`
  const future = new Date()
  future.setFullYear(future.getFullYear() + 3)
  const expiry = `${String(future.getMonth() + 1).padStart(2, "0")}${String(future.getFullYear() % 100)}`

  await page.getByTestId("demo-card-number-input").fill(number)
  await page.getByTestId("demo-card-expiry-input").fill(expiry)
  await page.getByTestId("demo-card-cvc-input").fill("123")
}

/** The seeded pickup points for this stand's profile, read straight off the seed data the backend uses. */
export function seededPickupPoints(profile: ProfileId): Array<{
  name: string
  address: { address_1: string; city: string; postal_code: string; country_code: string }
  opening_hours: string
}> {
  const file = path.resolve(
    __dirname,
    "../../../backend/src/migration-scripts/data/profiles",
    profile,
    "pickup-points.json"
  )
  return JSON.parse(readFileSync(file, "utf8"))
}

/**
 * Scans visible text for a raw composition/status identifier standing alone (h1-h6,
 * p1-p5, f1-f6, g/h/j/k/l/m/ga/gb, on/off) — acceptance's "no raw identifier on
 * screen" criterion. A false positive would need an unrelated one-two-character token
 * to appear as its OWN text node, which the composition/panel vocabulary never does
 * (every label is a full word or sentence) — see the panel's own HEADER_LABELS etc.
 */
export async function assertNoRawIdentifiers(page: Page) {
  const offenders: string[] = await page.evaluate(() => {
    const pattern = /^(h[1-6]|p[1-5]|f[1-6]|ga|gb|g|h|j|k|l|m|on|off)$/i
    const found: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = (node.textContent ?? "").trim()
      if (text && pattern.test(text)) found.push(text)
      node = walker.nextNode()
    }
    return found
  })
  expect(offenders, `raw identifiers visible on screen: ${offenders.join(", ")}`).toHaveLength(0)
}

/** True if every h1/h2/h3 (and, when given, extra selectors) fits its box with no clipping. */
export async function assertNoHeadingOverflow(page: Page, extraSelectors: string[] = []) {
  const selector = ["h1", "h2", "h3", ...extraSelectors].join(", ")
  const overflowing: string[] = await page.evaluate((sel) => {
    const bad: string[] = []
    document.querySelectorAll(sel).forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1) {
        bad.push(`${el.tagName.toLowerCase()}: "${(el.textContent ?? "").trim().slice(0, 60)}"`)
      }
    })
    return bad
  }, selector)
  expect(overflowing, `headings overflowing at this viewport: ${overflowing.join(" | ")}`).toHaveLength(0)
}
