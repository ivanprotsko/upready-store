import { describe, expect, it, vi } from "vitest"

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

  // A subset, not the same list: a block PR adds its parser here only, and the backend takes that
  // block's props from the catalogue template until a line copies the parser over.
  it("every props check on the backend copies a props parser here", () => {
    const parsed: string[] = BLOCKS.filter((block) => block.parseProps).map((block) => block.id)
    expect(Object.keys(backend.PROPS_CHECKS).filter((id) => !parsed.includes(id))).toEqual([])
    const unchecked = parsed.filter((id) => !Object.prototype.hasOwnProperty.call(backend.PROPS_CHECKS, id))
    if (unchecked.length) {
      console.info(`props the backend takes from the catalogue template only (${unchecked.length}): ${unchecked.join(", ")}`)
    }
  })
})
