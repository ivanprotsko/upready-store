import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  ADVISORY,
  FOOTER_KEYS,
  FOOTER_LABELS,
  FORBIDDEN,
  HEADER_KEYS,
  HEADER_LABELS,
  HERO_KEYS,
  HERO_LABELS,
  LISTING_KEYS,
  LISTING_LABELS,
  PICKUP_METADATA_KEYS,
  PROFILE_DEFAULTS,
  SCHEMA_ID,
  TILES_KEYS,
  TILES_LABELS,
  isAdvisory,
  isForbidden,
  validate,
  validateFields,
  type ProfileId,
  type StorefrontSettingsInput,
} from "./composition"

const REPO = join(__dirname, "../../../../..")
const CONTRACT = join(REPO, "artifacts/docs/2026-09-09-composition-contract.json")

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"))

const VALID: StorefrontSettingsInput = {
  defaultMode: "light",
  header: "h1",
  hero: "k",
  tiles: "on",
  listing: "p1",
  footer: "f1",
}

describe("enum keys match composition-contract.json's field vocabulary", () => {
  const contract = readJson(CONTRACT)

  it("header", () => {
    expect(HEADER_KEYS).toEqual(contract.fields.header.values.map((v: { key: string }) => v.key))
  })
  it("hero", () => {
    expect(HERO_KEYS).toEqual(contract.fields.hero.values.map((v: { key: string }) => v.key))
  })
  it("tiles", () => {
    expect(TILES_KEYS).toEqual(contract.fields.tiles.values.map((v: { key: string }) => v.key))
  })
  it("listing", () => {
    expect(LISTING_KEYS).toEqual(
      contract.fields.listing.values.map((v: { key: string }) => v.key)
    )
  })
  it("footer", () => {
    expect(FOOTER_KEYS).toEqual(contract.fields.footer.values.map((v: { key: string }) => v.key))
  })
})

describe("labels", () => {
  it("has one next-intl key per enum value, no bare display text", () => {
    for (const labels of [HEADER_LABELS, HERO_LABELS, TILES_LABELS, LISTING_LABELS, FOOTER_LABELS]) {
      for (const key of Object.values(labels)) {
        expect(key).toMatch(/^Composition\.[a-zA-Z]+\.[a-zA-Z0-9]+$/)
      }
    }
  })

  it("covers every key of its own enum, exactly", () => {
    expect(Object.keys(HEADER_LABELS).sort()).toEqual([...HEADER_KEYS].sort())
    expect(Object.keys(HERO_LABELS).sort()).toEqual([...HERO_KEYS].sort())
    expect(Object.keys(TILES_LABELS).sort()).toEqual([...TILES_KEYS].sort())
    expect(Object.keys(LISTING_LABELS).sort()).toEqual([...LISTING_KEYS].sort())
    expect(Object.keys(FOOTER_LABELS).sort()).toEqual([...FOOTER_KEYS].sort())
  })
})

describe("FORBIDDEN", () => {
  it("matches composition-contract.json's forbidden validity entries, in order", () => {
    const contract = readJson(CONTRACT)
    const forbidden = contract.validity.filter((v: { type: string }) => v.type === "forbidden")
    expect(FORBIDDEN.length).toBe(forbidden.length)
    forbidden.forEach((rule: Record<string, unknown>, i: number) => {
      const condition = rule.condition as Record<string, string>
      const [field, against] = Object.keys(condition)
      expect(FORBIDDEN[i].field).toBe(field)
      expect(FORBIDDEN[i].value).toBe(condition[field])
      expect(FORBIDDEN[i].against).toBe(against)
      expect(FORBIDDEN[i].againstValue).toBe(condition[against])
    })
  })

  it("isForbidden blocks header h4 + hero k in either field order", () => {
    const rule = isForbidden({ ...VALID, header: "h4", hero: "k" })
    expect(rule?.field).toBe("header")
    expect(rule?.value).toBe("h4")
  })

  it("isForbidden blocks footer f6 + defaultMode dark", () => {
    const rule = isForbidden({ ...VALID, footer: "f6", defaultMode: "dark" })
    expect(rule?.reason).toMatch(/detached/)
  })

  it("does not block footer f6 on light mode, or header h4 without hero k", () => {
    expect(isForbidden({ ...VALID, footer: "f6", defaultMode: "light" })).toBeNull()
    expect(isForbidden({ ...VALID, header: "h4", hero: "g" })).toBeNull()
  })

  it("every PROFILE_DEFAULTS entry passes both the forbidden and field checks", () => {
    for (const [id, doc] of Object.entries(PROFILE_DEFAULTS)) {
      expect(isForbidden(doc), `${id} composition is forbidden`).toBeNull()
      expect(validateFields(doc), `${id} composition fails field validation`).toEqual([])
    }
  })
})

describe("ADVISORY", () => {
  it("matches composition-contract.json's one advisory entry", () => {
    const contract = readJson(CONTRACT)
    const advisory = contract.validity.find((v: { type: string }) => v.type === "advisory")
    expect(ADVISORY.length).toBe(1)
    expect(ADVISORY[0].field).toBe(Object.keys(advisory.condition)[0])
    expect(ADVISORY[0].values).toEqual(advisory.condition.hero)
    expect(ADVISORY[0].against).toBe("tiles")
    expect(ADVISORY[0].againstValue).toBe(advisory.condition.tiles)
  })

  it("isAdvisory flags hero ga/gb with tiles on, but never blocks", () => {
    expect(isAdvisory({ ...VALID, hero: "ga", tiles: "on" })).not.toBeNull()
    expect(isAdvisory({ ...VALID, hero: "gb", tiles: "on" })).not.toBeNull()
    expect(isAdvisory({ ...VALID, hero: "ga", tiles: "off" })).toBeNull()
    expect(isForbidden({ ...VALID, hero: "ga", tiles: "on" })).toBeNull()
  })
})

describe("validateFields", () => {
  it("accepts a fully-populated valid document", () => {
    expect(validateFields(VALID)).toEqual([])
  })

  it("rejects a non-object body", () => {
    expect(validateFields(null)).toHaveLength(1)
    expect(validateFields("h1")).toHaveLength(1)
    expect(validateFields(undefined)).toHaveLength(1)
  })

  it("reports one error per missing or out-of-enum field, naming the field", () => {
    const errors = validateFields({ defaultMode: "dark" })
    const fields = errors.map((e) => e.field).sort()
    expect(fields).toEqual(["footer", "header", "hero", "listing", "tiles"])
  })

  it("rejects an unknown enum value", () => {
    const errors = validateFields({ ...VALID, header: "h7" })
    expect(errors).toEqual([{ field: "header", message: expect.stringContaining("header must be") }])
  })
})

describe("validate", () => {
  it("ok:true for a valid, non-forbidden document", () => {
    const result = validate(VALID)
    expect(result.ok).toBe(true)
  })

  it("kind invalid_field takes priority over the forbidden check", () => {
    const result = validate({ ...VALID, header: "h4", hero: "not-a-key" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe("invalid_field")
  })

  it("kind forbidden_combination once fields are all valid", () => {
    const result = validate({ ...VALID, header: "h4", hero: "k" })
    expect(result.ok).toBe(false)
    if (!result.ok && result.kind === "forbidden_combination") {
      expect(result.rule.field).toBe("header")
    } else {
      throw new Error("expected forbidden_combination")
    }
  })
})

describe("PROFILE_DEFAULTS", () => {
  it("has exactly the five store profiles", () => {
    const ids: ProfileId[] = [
      "sneakers",
      "electronics",
      "supplements",
      "womens-fashion",
      "home-goods",
    ]
    expect(Object.keys(PROFILE_DEFAULTS).sort()).toEqual([...ids].sort())
  })

  it("matches composition-contract.json's profileDefaults field-for-field, except sneakers' hero", () => {
    const contract = readJson(CONTRACT)
    for (const [id, doc] of Object.entries(PROFILE_DEFAULTS)) {
      const source = contract.profileDefaults[id]
      expect(source, `${id} missing from composition-contract.json`).toBeDefined()
      const { source: _s, ...expected } = source
      if (id === "sneakers") {
        // deliberate deviation — see the doc comment on PROFILE_DEFAULTS
        expect(doc).toEqual({ ...expected, hero: "k" })
      } else {
        expect(doc).toEqual(expected)
      }
    }
  })

  it("sneakers no longer defaults to the unimplemented hero L", () => {
    expect(PROFILE_DEFAULTS.sneakers.hero).not.toBe("l")
  })
})

describe("SCHEMA_ID and PICKUP_METADATA_KEYS", () => {
  it("schema id matches the mockup's documented value", () => {
    expect(SCHEMA_ID).toBe("upready.storefront-settings/v1")
  })

  it("pickup metadata keys are snake_case and unique", () => {
    const values = Object.values(PICKUP_METADATA_KEYS)
    expect(values).toEqual(Array.from(new Set(values)))
    for (const v of values) expect(v).toMatch(/^[a-z][a-z_]*[a-z]$/)
  })
})
