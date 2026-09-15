import { describe, expect, it } from "vitest"
import {
  redactMigrationMetadata,
  stripMigrationMetadata,
} from "./migration-metadata"

describe("stripMigrationMetadata", () => {
  it("removes the import's provenance and keeps everything else", () => {
    const clean = stripMigrationMetadata({
      id: "prod_1",
      metadata: {
        migrated_from: "chrxnasdmds",
        source_url: "https://olavka.ru/ru/ru/products/x",
        source_handle: "x",
        seo: { ru: { title: "Заголовок" } },
      },
    })

    expect(clean.metadata).toEqual({ seo: { ru: { title: "Заголовок" } } })
  })

  it("leaves an entity without provenance untouched, by identity", () => {
    const product = { id: "prod_1", metadata: { seo: {} } }
    expect(stripMigrationMetadata(product)).toBe(product)
  })

  it("tolerates a missing or null metadata", () => {
    expect(stripMigrationMetadata({ id: "prod_1" })).toEqual({ id: "prod_1" })
    expect(stripMigrationMetadata({ id: "prod_1", metadata: null })).toEqual({
      id: "prod_1",
      metadata: null,
    })
    expect(stripMigrationMetadata(null)).toBeNull()
  })
})

describe("redactMigrationMetadata", () => {
  it("cuts the provenance out of a whole Store API answer, however deep", () => {
    const answer = redactMigrationMetadata({
      products: [
        {
          id: "prod_1",
          metadata: { source_url: "https://olavka.ru/a", seo: { ru: {} } },
          variants: [{ id: "var_1", metadata: { source_sku: "PL-01", size: "100" } }],
          categories: [
            {
              id: "cat_1",
              metadata: { source_handle: "dobavki" },
              products: [{ id: "prod_2", metadata: { source_url: "https://olavka.ru/b" } }],
            },
          ],
          collection: { id: "col_1", metadata: { migrated_from: "chrxnasdmds" } },
        },
      ],
      count: 1,
    })

    expect(JSON.stringify(answer)).not.toContain("olavka.ru")
    expect(JSON.stringify(answer)).not.toContain("source_sku")
    expect(JSON.stringify(answer)).not.toContain("migrated_from")
    expect(answer.products[0].metadata).toEqual({ seo: { ru: {} } })
    expect(answer.products[0].variants[0].metadata).toEqual({ size: "100" })
    expect(answer.products[0].categories[0].products[0].metadata).toEqual({})
    expect(answer.count).toBe(1)
  })

  it("returns an untouched answer by identity, so a clean shop pays nothing", () => {
    const answer = { products: [{ id: "prod_1", metadata: { seo: {} } }], count: 1 }
    expect(redactMigrationMetadata(answer)).toBe(answer)
  })

  it("does not touch metadata of other features", () => {
    const order = {
      order: {
        id: "order_1",
        metadata: { pickup_point_code: "CDEK-123", source_id: "prod_1" },
      },
    }
    expect(redactMigrationMetadata(order)).toBe(order)
  })

  it("survives an array at the top and a value that is not an object", () => {
    expect(redactMigrationMetadata([{ metadata: { source_url: "https://olavka.ru/a" } }])).toEqual([
      { metadata: {} },
    ])
    expect(redactMigrationMetadata("plain text")).toBe("plain text")
    expect(redactMigrationMetadata(null)).toBeNull()
  })

  it("stops at a bounded depth instead of following a cycle for ever", () => {
    const node: Record<string, unknown> = { metadata: { source_url: "https://olavka.ru/a" } }
    node.self = node

    expect(() => redactMigrationMetadata(node)).not.toThrow()
  })
})
