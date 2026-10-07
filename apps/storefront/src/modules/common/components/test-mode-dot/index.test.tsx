import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import TestModeDot from "."
import {
  EMPTY_TENANT_TEST_MODE,
  HIDE_TEST_MODE_DOT_ENV,
  testModeDotHidden,
  visibleTestMode,
} from "@lib/tenant/test-mode"

/**
 * t-2026-10-08-13. The red dot is the owner's mark of test payments and delivery
 * (t-2026-10-04-21). A shop under Robokassa moderation stays in test until the moderation
 * ends, so `STOREFRONT_HIDE_TEST_MODE_DOT` takes the dot off the page for that time.
 */

const IN_TEST = { payments: true, delivery: true }

const render = () =>
  renderToStaticMarkup(<TestModeDot mode={visibleTestMode(IN_TEST)} locale="ru" />)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("the test-mode dot behind STOREFRONT_HIDE_TEST_MODE_DOT", () => {
  it("is there without the variable", () => {
    const html = render()

    expect(html).toContain('data-testid="test-mode-dot"')
    expect(html).toContain("Включены тестовые оплаты и доставка")
  })

  it.each(["1", "true", " TRUE "])("is not there with the variable set to %j", (value) => {
    vi.stubEnv("STOREFRONT_HIDE_TEST_MODE_DOT", value)

    expect(render()).toBe("")
  })

  it.each(["", "0", "false", "no", "yes"])("stays with the variable set to %j", (value) => {
    vi.stubEnv("STOREFRONT_HIDE_TEST_MODE_DOT", value)

    expect(render()).toContain('data-testid="test-mode-dot"')
  })
})

describe("the rule itself", () => {
  it("reads the variable by its name, from the environment it is given", () => {
    expect(HIDE_TEST_MODE_DOT_ENV).toBe("STOREFRONT_HIDE_TEST_MODE_DOT")
    expect(testModeDotHidden({})).toBe(false)
    expect(testModeDotHidden({ [HIDE_TEST_MODE_DOT_ENV]: "1" })).toBe(true)
    expect(testModeDotHidden({ [HIDE_TEST_MODE_DOT_ENV]: "true" })).toBe(true)
    expect(testModeDotHidden({ [HIDE_TEST_MODE_DOT_ENV]: "2" })).toBe(false)
  })

  it("hands the dot the shop's own mode, or nothing in test with the switch on", () => {
    expect(visibleTestMode(IN_TEST, {})).toBe(IN_TEST)
    expect(visibleTestMode(IN_TEST, { [HIDE_TEST_MODE_DOT_ENV]: "1" })).toEqual(EMPTY_TENANT_TEST_MODE)
  })
})

describe("app/layout.tsx", () => {
  it("draws the dot through the switch", () => {
    const layout = readFileSync(join(__dirname, "../../../../app/layout.tsx"), "utf8")

    expect(layout).toContain("<TestModeDot mode={visibleTestMode(testMode)} locale={locale} />")
    expect(layout).not.toContain("<TestModeDot mode={testMode}")
  })
})
