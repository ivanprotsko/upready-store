import { describe, expect, it, vi } from "vitest"

import { locales } from "@i18n/config"
import { blockById, BLOCKS } from "@modules/blocks/registry"

// The backend's copy, a pure module: this test is what keeps the two in step.
import * as backend from "../../../../backend/src/api/tenants/home/template/validation"
import { TEMPLATE_SOURCES } from "./catalog"
import { BUTTON_STYLES, DENSITIES, PHOTO_STYLES, RADII, validateTemplate } from "./manifest"
import fixtures from "./parity.fixtures.json"

// The registry reaches `server-only` loaders through the header and footer variants. Hoisted by vitest.
vi.mock("server-only", () => ({}))

/**
 * Both copies of the template validator on the same fixtures (t-2026-10-12-33):
 * `manifest.ts` here, and `apps/backend/src/api/tenants/home/template/validation.ts`, which
 * `POST /tenants/home/template` runs before it writes a shop's document. A rule changed on
 * one side only fails here, by the case that tells them apart.
 */

type Case = {
  name: string
  input?: unknown
  set?: Record<string, unknown>
  delete?: string[]
  errors?: string[]
}

/** `base` with each `set` path written and each `delete` path removed; `input` replaces it. */
function inputOf(fixture: Case): unknown {
  if ("input" in fixture) return fixture.input
  const value = JSON.parse(JSON.stringify(fixtures.base)) as Record<string, unknown>
  const walk = (path: string) => {
    const keys = path.split(".")
    const last = keys.pop() as string
    let at: Record<string, unknown> = value
    for (const key of keys) at = at[key] as Record<string, unknown>
    return { at, last }
  }
  for (const [path, next] of Object.entries(fixture.set ?? {})) {
    const { at, last } = walk(path)
    at[last] = next
  }
  for (const path of fixture.delete ?? []) {
    const { at, last } = walk(path)
    delete at[last]
  }
  return value
}

const verdict = (result: { ok: true } | { ok: false; errors: { field: string; message: string }[] }) =>
  result.ok ? [] : result.errors.map((error) => `${error.field}: ${error.message}`)

const CASES = fixtures.cases as Case[]

describe("the template validator, storefront and backend", () => {
  it.each(CASES.map((fixture) => [fixture.name, fixture] as const))("%s", (_name, fixture) => {
    const input = inputOf(fixture)
    const storefront = validateTemplate(input, blockById)
    const server = backend.validateTemplate(input)

    expect(verdict(server)).toEqual(verdict(storefront))
    expect(verdict(storefront)).toEqual(fixture.errors ?? [])
    expect(server.ok ? null : server.forbidden ?? null).toEqual(storefront.ok ? null : storefront.forbidden ?? null)
    if (storefront.ok && server.ok) {
      // The composition's ADVISORY pairs are not on the backend; placeholders are on both.
      const placeholders = storefront.advisories.filter((line) => line.includes("placeholder"))
      expect(server.advisories).toEqual(placeholders)
    }
  })

  it.each(Object.keys(TEMPLATE_SOURCES))("every template of the catalogue passes both: %s", (id) => {
    expect(verdict(validateTemplate(TEMPLATE_SOURCES[id], blockById))).toEqual([])
    expect(verdict(backend.validateTemplate(TEMPLATE_SOURCES[id]))).toEqual([])
  })

  it("the layer lists are the same", () => {
    expect(backend.RADII).toEqual(RADII)
    expect(backend.BUTTON_STYLES).toEqual(BUTTON_STYLES)
    expect(backend.PHOTO_STYLES).toEqual(PHOTO_STYLES)
    expect(backend.DENSITIES).toEqual(DENSITIES)
  })

  // The same list: `pnpm templates:export` copies every block's parser to the backend.
  it("the backend checks the props of every block that has a props parser here, and of no other", () => {
    const parsed: string[] = BLOCKS.filter((block) => block.parseProps).map((block) => block.id)
    expect(Object.keys(backend.PROPS_CHECKS).sort()).toEqual(parsed.sort())
  })
})

/**
 * Each block's props, the storefront's `parseProps` and the backend's `PROPS_CHECKS` line, on
 * the block's two fixtures and two broken inputs made from its sample: the first prop given a
 * value of another type, and the first text of the sample made longer than any limit.
 */
const LOCALE_CODES = new Set<string>(locales)
const OVER_ANY_LIMIT = "x".repeat(5000)

/** A fresh copy for each side, so that neither parser sees what the other may have changed. */
const clone = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

const isText = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.entries(value).every(([code, line]) => LOCALE_CODES.has(code) && typeof line === "string")

/** The sample with its first text, depth first, made too long; null when the sample has no text. */
function tooLong(sample: unknown): unknown {
  const copy = clone(sample)
  const walk = (value: unknown): boolean => {
    if (isText(value)) {
      value[Object.keys(value)[0]] = OVER_ANY_LIMIT
      return true
    }
    if (typeof value !== "object" || value === null) return false
    return Object.values(value).some(walk)
  }
  return walk(copy) ? copy : null
}

/** The sample with its first prop of another type: a number where it held anything else, else a string. */
function wrongType(sample: Record<string, unknown>): unknown {
  const [key] = Object.keys(sample)
  return { ...(clone(sample) as Record<string, unknown>), [key]: typeof sample[key] === "number" ? "42" : 42 }
}

const WITH_PROPS = BLOCKS.filter((block) => block.parseProps)

describe("every block's props, storefront parser and backend check", () => {
  it.each(WITH_PROPS.map((block) => [block.id, block] as const))("%s", (id, block) => {
    const parse = block.parseProps as (input: unknown) => { ok: true } | { ok: false; errors: string[] }
    const check = backend.PROPS_CHECKS[id]
    expect(check, `${id} has no PROPS_CHECKS line`).toBeTypeOf("function")
    const storefront = (input: unknown) => {
      const result = parse(clone(input))
      return result.ok ? [] : result.errors
    }
    const sample = block.fixtures?.sample as Record<string, unknown> | undefined
    expect(sample, `${id} has no fixtures.sample`).toBeTypeOf("object")
    const long = tooLong(sample)
    expect(long, `${id}: the sample has no text to make too long`).not.toBeNull()

    const inputs = {
      sample,
      empty: block.fixtures?.empty,
      "a wrong type": wrongType(sample as Record<string, unknown>),
      "a text over its limit": long,
    }
    for (const [name, input] of Object.entries(inputs)) {
      const verdict = storefront(input)
      expect(check(clone(input)), `${id}, ${name}`).toEqual(verdict)
      if (name === "sample" || name === "empty") expect(verdict, `${id}, ${name}`).toEqual([])
      else expect(verdict.length, `${id}, ${name}: refused`).toBeGreaterThan(0)
    }
  })
})
