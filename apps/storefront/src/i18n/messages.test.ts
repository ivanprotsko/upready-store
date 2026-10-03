import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { locales } from "./config"

/**
 * Key parity across the storefront catalogs (t-2026-10-03-32). `request.ts`
 * loads exactly one catalog, `messages/${locale}.json`, and merges nothing from
 * English under it, so a key that `en.json` has and another catalog lacks fails
 * at runtime on that locale only and never at build time. PR #227 shipped the
 * `PaymentPreNotice` block in `en` and `ru` alone, and the pre-payment notice
 * broke in the other 34 locales. Every catalog's keys, flattened with dots, are
 * compared with `en.json`, and a drift names the locale and the keys.
 */

const MESSAGES_DIR = path.resolve(__dirname, "../../messages")

type Catalog = { [key: string]: string | Catalog }

const flatKeys = (catalog: Catalog, prefix = ""): string[] =>
  Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )

const keysOf = (locale: string) =>
  flatKeys(
    JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"))
  )

const catalogs = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort()

describe("storefront message catalogs: same keys as en.json", () => {
  it("ships exactly one catalog per locale in config.ts", () => {
    expect(catalogs).toEqual([...locales].sort())
  })

  const reference = keysOf("en")
  const inReference = new Set(reference)

  it.each(catalogs.filter((locale) => locale !== "en"))(
    "%s.json has every key of en.json and no other",
    (locale) => {
      const own = keysOf(locale)
      const inOwn = new Set(own)
      const missing = reference.filter((key) => !inOwn.has(key))
      const extra = own.filter((key) => !inReference.has(key))
      expect({ missing, extra }, `${locale}.json against en.json`).toEqual({
        missing: [],
        extra: [],
      })
    }
  )
})
