import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it, vi } from "vitest"

import {
  mergeRegulatedAs,
  readRegulatedAs as readPanelMark,
  REGULATED_AS_CHOICES,
  REGULATED_AS_KEY as PANEL_KEY,
} from "../../../../../tenant-panel/src/lib/regulated-product"
import {
  readRegulatedAs,
  REGULATED_AS_KEY,
  showsSupplementNotice,
} from "@lib/util/regulated-product"
import { PRODUCT_METADATA_KEYS } from "@lib/util/product-metadata"
import SupplementNotice from "@modules/products/components/supplement-notice"

/**
 * t-2026-10-09-49 (Ivan's ask 9c7d, item 7): «нам нужно размечать в админке что является бадом
 * или лекарственным препаратом а что нет и если отмечено, то должна где-то в описании снизу
 * (если это разрешено законом) появляться надпись». The owner marks a product in the shop panel,
 * the mark rides in `metadata.regulated_as`, and the product page of a supplement prints
 * «Не является лекарственным средством» under the description, the wording of 38-ФЗ «О рекламе»,
 * art. 25, part 1.1 (`~/upready/research/raw/2026-10-09-supplement-marking/source-1-38fz-st25.md`).
 *
 * The product page is called for real with its data and its children stubbed, and the test reads
 * the tree it returns: where the notice stands, and that a product without the mark returns the
 * same tree as before.
 */

const state = vi.hoisted(() => ({ course: null as unknown }))

const stub = (name: string) => {
  const Stub = ({ children }: { children?: ReactNode }) => <>{children}</>
  Stub.displayName = name
  return Stub
}

vi.mock("next-intl/server", async () => {
  const ru = (await import("../../../../messages/ru.json"))
    .default as unknown as Record<string, Record<string, string>>
  return {
    getTranslations: async () => (key: string) => {
      const [section, name] = key.split(".")
      return ru[section]?.[name] ?? key
    },
    getLocale: async () => "ru",
  }
})
vi.mock("next/navigation", () => ({ notFound: () => null }))
vi.mock("@lib/data/courses", () => ({ getProductCourse: async () => state.course }))
vi.mock("@lib/data/product-attributes", () => ({ listProductAttributes: async () => [] }))
vi.mock("@lib/data/product-reviews", () => ({
  listProductReviews: async () => ({ summary: { count: 0, average: 0 }, reviews: [], count: 0 }),
}))
vi.mock("@lib/util/json-ld", () => ({ buildProductJsonLd: async () => ({}) }))
vi.mock("@lib/util/course-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/util/course-page")>()),
  readCourseCover: () => null,
  readCoursePage: () => null,
}))
vi.mock("@modules/products/components/product-attributes/rows", () => ({
  prepareAttributeRows: (rows: unknown[]) => rows,
}))
vi.mock("@modules/products/components/image-gallery", () => ({ default: stub("ImageGallery") }))
vi.mock("@modules/products/components/product-actions", () => ({ default: stub("ProductActions") }))
vi.mock("@modules/products/components/product-attributes/summary", () => ({
  default: stub("AttributesSummary"),
}))
vi.mock("@modules/products/components/product-details-drawer", () => ({
  default: stub("ProductDetailsDrawer"),
}))
vi.mock("@modules/products/components/product-details-drawer/opener", () => ({
  default: stub("ProductDetailsOpener"),
}))
vi.mock("@modules/products/components/product-onboarding-cta", () => ({
  default: stub("ProductOnboardingCta"),
}))
vi.mock("@modules/products/components/product-selection", () => ({
  ProductSelectionProvider: stub("ProductSelectionProvider"),
}))
vi.mock("@modules/products/components/product-selection/variant-picker", () => ({
  default: stub("VariantPicker"),
}))
vi.mock("@modules/products/components/related-products", () => ({ default: stub("RelatedProducts") }))
vi.mock("@modules/products/components/recently-viewed", () => ({ default: stub("RecentlyViewed") }))
vi.mock("@modules/products/templates/product-info", () => ({ default: stub("ProductInfo") }))
vi.mock("@modules/products/components/course-block", () => ({ default: stub("CourseBlock") }))
vi.mock("@modules/products/components/course-page/cover", () => ({ default: stub("CourseCover") }))
vi.mock("@modules/products/components/course-page/description", () => ({
  default: stub("CourseDescription"),
}))
vi.mock("@modules/products/components/course-page/sections", () => ({
  CourseAbout: stub("CourseAbout"),
  CourseFaq: stub("CourseFaq"),
  CourseTestimonials: stub("CourseTestimonials"),
}))
vi.mock("@modules/products/components/product-description/excerpt", () => ({
  default: stub("DescriptionExcerpt"),
}))
vi.mock("@modules/skeletons/templates/skeleton-related-products", () => ({
  default: stub("SkeletonRelatedProducts"),
}))
vi.mock("@modules/common/components/breadcrumb", () => ({ default: stub("Breadcrumb") }))
vi.mock("@modules/common/components/hydration-slot", () => ({ default: stub("HydrationSlot") }))
vi.mock("@modules/common/components/json-ld", () => ({ default: stub("JsonLd") }))
vi.mock("@modules/products/components/product-reviews", () => ({
  default: stub("ProductReviews"),
  REVIEWS_PAGE_SIZE: 5,
}))
vi.mock("@modules/products/templates/product-actions-wrapper", () => ({
  default: stub("ProductActionsWrapper"),
}))

const NOTICE_RU = "Не является лекарственным средством."

const product = (metadata: Record<string, unknown> | null) =>
  ({
    id: "prod_test_1",
    handle: "asd-tabletki",
    title: "Таблетки",
    description: "<p>Состав и способ применения.</p>",
    categories: [],
    metadata,
  }) as unknown as HttpTypes.StoreProduct

const page = async (metadata: Record<string, unknown> | null, course: unknown = null) => {
  state.course = course
  const { default: ProductTemplate } = await import("@modules/products/templates")
  return (await ProductTemplate({
    product: product(metadata),
    region: { id: "reg_1" } as HttpTypes.StoreRegion,
    countryCode: "ru",
    images: [],
    reviewsPage: 1,
  })) as ReactElement
}

/** Every element of the tree, depth first, with the element that holds it. */
const walk = (node: ReactNode, parent: ReactElement | null = null, out: [ReactElement, ReactElement | null][] = []) => {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, parent, out)
  } else if (isValidElement(node)) {
    out.push([node, parent])
    walk((node.props as { children?: ReactNode }).children, node, out)
  }
  return out
}

const typeName = (element: ReactElement) =>
  typeof element.type === "string"
    ? element.type
    : ((element.type as { displayName?: string; name?: string }).displayName ??
      (element.type as { name?: string }).name ??
      "")

const notices = (tree: ReactElement) => walk(tree).filter(([el]) => el.type === SupplementNotice)
const drawers = (tree: ReactElement) =>
  walk(tree).filter(([el]) => typeName(el) === "ProductDetailsDrawer")

/** The children of the element holding `target`, by type name, so a position is read off the tree. */
const siblingsOf = (tree: ReactElement, target: ReactElement) => {
  const holder = walk(tree).find(([el]) => el === target)?.[1]
  const kids = walk((holder?.props as { children?: ReactNode }).children)
    .filter(([, parent]) => parent === null)
    .map(([el]) => (el.type === SupplementNotice ? "SupplementNotice" : typeName(el)))
  return kids
}

const here = path.dirname(new URL(import.meta.url).pathname)
const panel = (relative: string) =>
  readFileSync(path.join(here, "../../../../../tenant-panel/src", relative), "utf8")

describe("acceptance 1: the field in the shop panel", () => {
  it("the panel offers the mark in the product form and stores it under metadata.regulated_as", () => {
    // One key on both sides, and the storefront is allowed to receive it.
    expect(PANEL_KEY).toBe(REGULATED_AS_KEY)
    expect(PRODUCT_METADATA_KEYS).toContain(REGULATED_AS_KEY)

    // The three choices of the select, and what each one writes.
    expect(REGULATED_AS_CHOICES).toEqual(["none", "supplement", "medicine"])
    const before = { seo: { ru: { title: "t" } }, digital: "false" }
    const marked = mergeRegulatedAs(before, "supplement")
    expect(marked).toEqual({ ...before, regulated_as: "supplement" })
    expect(readRegulatedAs({ metadata: marked })).toBe("supplement")
    expect(mergeRegulatedAs(marked, "medicine").regulated_as).toBe("medicine")
    expect(mergeRegulatedAs(marked, "none")).toEqual(before)
    expect(readPanelMark(mergeRegulatedAs(before, "none"))).toBeNull()

    // The edit form draws the select and saves through the merge, the card shows the value.
    const form = panel(
      "routes/products/product-edit/components/edit-product-form/edit-product-form.tsx"
    )
    expect(form).toMatch(/regulated_as: zod\.enum\(\["none", "supplement", "medicine"\]\)/)
    expect(form).toMatch(/name="regulated_as"/)
    expect(form).toMatch(/REGULATED_AS_CHOICES\.map/)
    expect(form).toMatch(/mergeRegulatedAs\(\s*mergeSeoMetadata\(/)
    const card = panel(
      "routes/products/product-detail/components/product-general-section/product-general-section.tsx"
    )
    expect(card).toMatch(/title=\{t\("products\.regulatedAs\.label"\)\}/)

    // Every string the field uses exists in both panel languages.
    for (const locale of ["ru", "en"]) {
      const strings = JSON.parse(panel(`i18n/translations/${locale}.json`)).products.regulatedAs
      expect(strings.label, locale).toBeTruthy()
      for (const choice of REGULATED_AS_CHOICES) {
        expect(strings.options[choice], `${locale} options.${choice}`).toBeTruthy()
        expect(strings.hints[choice], `${locale} hints.${choice}`).toBeTruthy()
      }
    }
    const ru = JSON.parse(panel("i18n/translations/ru.json")).products.regulatedAs
    expect(ru.hints.supplement).toContain("ст. 25, ч. 1.1")
    expect(ru.hints.medicine).toContain("ст. 55, ч. 1.1")
  })
})

describe("acceptance 2: the notice on the product page", () => {
  it("a product marked as a supplement says «Не является лекарственным средством» under its description", async () => {
    const tree = await page({ regulated_as: "supplement" })

    const found = notices(tree)
    expect(found).toHaveLength(1)
    expect(found[0][0].props).toEqual({ text: NOTICE_RU })
    // In the product card right under the description's excerpt, before the drawer's button.
    const row = siblingsOf(tree, found[0][0])
    const at = row.indexOf("SupplementNotice")
    expect(row[at - 1]).toBe("DescriptionExcerpt")
    expect(row[at + 1]).toBe("ProductDetailsOpener")
    // And in the drawer, under the whole description.
    expect(drawers(tree).map(([el]) => (el.props as { supplementNotice?: unknown }).supplementNotice)).toEqual([
      NOTICE_RU,
    ])

    // A course page puts it under the course's description.
    const course = await page({ regulated_as: "supplement" }, { id: "course_1" })
    const inCourse = notices(course)
    expect(inCourse).toHaveLength(1)
    const courseRow = siblingsOf(course, inCourse[0][0])
    expect(courseRow[courseRow.indexOf("SupplementNotice") - 1]).toBe("CourseDescription")

    // The wording is the law's own (38-ФЗ, art. 25, part 1.1), drawn as plain text.
    expect(renderToStaticMarkup(<SupplementNotice text={NOTICE_RU} />)).toBe(
      `<p class="text-sm font-medium leading-6 text-ui-fg-base" data-testid="product-supplement-notice">${NOTICE_RU}</p>`
    )
  })

  it("every storefront language carries its own translation of the notice", () => {
    const dir = path.join(here, "../../../../messages")
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
    expect(files).toHaveLength(36)
    const english = JSON.parse(readFileSync(path.join(dir, "en.json"), "utf8")).ProductInfo.supplementNotice
    expect(english).toBe("Not a medicinal product.")
    for (const file of files) {
      const text = JSON.parse(readFileSync(path.join(dir, file), "utf8")).ProductInfo.supplementNotice
      expect(text, file).toBeTruthy()
      if (file !== "en.json") expect(text, file).not.toBe(english)
    }
  })
})

describe("acceptance 3: shops without the mark do not change", () => {
  it("a product without the mark renders no notice", async () => {
    const without = await page(null)
    expect(notices(without)).toHaveLength(0)
    expect(drawers(without).map(([el]) => (el.props as { supplementNotice?: unknown }).supplementNotice)).toEqual([
      null,
    ])

    // The same tree as before the mark existed, whatever else the metadata holds.
    const shape = (tree: ReactElement) => walk(tree).map(([el]) => typeName(el)).join(" ")
    expect(shape(await page({ digital: "false", seo: { ru: { title: "t" } } }))).toBe(shape(without))
    // A medicine gets no line the law does not give, and neither does a value the page does not know.
    for (const value of ["medicine", "true", "Supplement", "", 1, true]) {
      expect(notices(await page({ regulated_as: value })), String(value)).toHaveLength(0)
      expect(showsSupplementNotice({ metadata: { regulated_as: value } }), String(value)).toBe(false)
    }
    // Only the owner's mark counts: neither a category called «БАДы» nor another project's flag.
    const guessed = { ...product({ is_supplement: true }), categories: [{ name: "БАДы" }] }
    expect(showsSupplementNotice(guessed as unknown as HttpTypes.StoreProduct)).toBe(false)
    expect(readRegulatedAs({ metadata: null })).toBeNull()
    expect(readRegulatedAs(null)).toBeNull()
  })
})
