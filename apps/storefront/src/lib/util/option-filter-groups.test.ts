import { describe, expect, it } from "vitest"
import type { HttpTypes } from "@medusajs/types"

import {
  MEDUSA_DEFAULT_OPTION_TITLE,
  MEDUSA_DEFAULT_OPTION_VALUE,
  groupOptionFilters,
  isPlaceholderOption,
} from "./option-filter-groups"

type Product = HttpTypes.StoreProduct

const product = (
  id: string,
  options: { id: string; title: string; values: { id: string; value: string }[] }[],
  variantOptionValueIds: string[][]
): Product =>
  ({
    id,
    options: options.map((option) => ({
      ...option,
      values: option.values.map((value) => ({ ...value, option_id: option.id })),
    })),
    variants: variantOptionValueIds.map((valueIds, index) => ({
      id: `${id}-v${index}`,
      options: valueIds.map((valueId) => ({
        id: valueId,
        option_id: options.find((o) => o.values.some((v) => v.id === valueId))!.id,
      })),
    })),
  }) as unknown as Product

describe("isPlaceholderOption", () => {
  it("recognises Medusa's default option by title and by its single default value", () => {
    expect(isPlaceholderOption({ title: MEDUSA_DEFAULT_OPTION_TITLE, values: [] })).toBe(true)
    expect(
      isPlaceholderOption({
        title: "Размер",
        values: [{ id: "v1", value: MEDUSA_DEFAULT_OPTION_VALUE }] as never,
      })
    ).toBe(true)
  })

  it("keeps a real single-value option", () => {
    expect(
      isPlaceholderOption({ title: "Size", values: [{ id: "v1", value: "42" }] as never })
    ).toBe(false)
  })
})

describe("groupOptionFilters", () => {
  it("leaves the placeholder option out and keeps only the values a variant uses", () => {
    const shoe = product(
      "shoe",
      [
        {
          id: "opt-size",
          title: "Размер",
          values: [
            { id: "size-41", value: "41" },
            { id: "size-42", value: "42" },
          ],
        },
      ],
      [["size-42"]]
    )
    const single = product(
      "single",
      [
        {
          id: "opt-default",
          title: MEDUSA_DEFAULT_OPTION_TITLE,
          values: [{ id: "default-value", value: MEDUSA_DEFAULT_OPTION_VALUE }],
        },
      ],
      [["default-value"]]
    )

    expect(groupOptionFilters([shoe, single])).toEqual([
      {
        id: "opt-size",
        title: "Размер",
        values: [{ id: "size-42", label: "42", hex: undefined }],
      },
    ])
  })

  it("merges the same option across products", () => {
    const a = product(
      "a",
      [{ id: "opt-colour", title: "Цвет", values: [{ id: "c-black", value: "Чёрный" }] }],
      [["c-black"]]
    )
    const b = product(
      "b",
      [{ id: "opt-colour", title: "Цвет", values: [{ id: "c-chalk", value: "Мел" }] }],
      [["c-chalk"]]
    )

    expect(groupOptionFilters([a, b]).map((g) => g.values.map((v) => v.label))).toEqual([
      ["Чёрный", "Мел"],
    ])
  })
})
