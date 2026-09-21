import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { CLEARINGS } from "./clearings"

/**
 * The event names live in two applications: the backend sends them and the
 * table in `./clearings.ts` answers them, and nothing tied the two lists. An
 * event the backend sends and the table does not know answers 200 and clears
 * nothing (architecture review 2026-09-21, finding L-1). This file reads the
 * backend's source, so the lists cannot drift apart without a red test.
 */

const BACKEND_SRC = resolve(__dirname, "../../../../../backend/src")

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "__tests__") {
      return []
    }

    return entry.isDirectory()
      ? walk(join(dir, entry.name))
      : [join(dir, entry.name)]
  })

const sources = walk(BACKEND_SRC)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => ({ file, source: readFileSync(file, "utf8") }))
  .filter(({ source }) => source.includes("notifyStorefrontRevalidate"))

// `inventory-updated.ts` names its events through Medusa's constants, as the
// backend linter asks: `InventoryLevelWorkflowEvents.CREATED` is
// "inventory-level.created". The backend spec `inventory-subscriber.unit.spec.ts`
// pins the constants to these literals, so the rule below cannot go stale.
const constantToName = (family: string, verb: string) =>
  `${family
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()}.${verb.toLowerCase()}`

// A subscriber forwards `event.name`, so what it sends is what it listens to.
const forwarded = sources
  .filter(({ source }) => source.includes("type: event.name"))
  .flatMap(({ source }) => {
    const list = source.match(/event:\s*\[([^\]]*)\]/)?.[1] ?? ""

    return [
      ...Array.from(list.matchAll(/"([^"]+)"/g)).map((match) => match[1]),
      ...Array.from(list.matchAll(/(\w+)WorkflowEvents\.(\w+)/g)).map((match) =>
        constantToName(match[1], match[2])
      ),
    ]
  })

// Everything else names its type as a literal at the call.
const literal = sources.flatMap(({ source }) =>
  Array.from(source.matchAll(/type:\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter((type) => type.startsWith("tenant."))
)

const sent = Array.from(new Set([...forwarded, ...literal])).sort()

describe("the revalidation events of the backend and the table of the storefront", () => {
  it("finds the senders in the backend source", () => {
    expect(forwarded.length).toBeGreaterThan(20)
    expect(literal.length).toBeGreaterThan(5)
  })

  it("has an entry for every event the backend sends", () => {
    expect(sent.filter((type) => !Object.hasOwn(CLEARINGS, type))).toEqual([])
  })

  it("has no entry the backend never sends", () => {
    expect(
      Object.keys(CLEARINGS).filter((type) => !sent.includes(type))
    ).toEqual([])
  })
})
