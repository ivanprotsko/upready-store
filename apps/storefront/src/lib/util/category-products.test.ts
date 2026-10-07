import { describe, expect, it } from "vitest"

import { categoryProductRefs, withCategoryProductRefs } from "./category-products"

/**
 * t-2026-10-08-13, part A5. The category tree is handed to client components, so whatever a
 * category's `products` hold is written into the code of every page. The answer below is the
 * shape `*products` returns: a published card, a draft and a card with a course page in its
 * `metadata`. `JSON.stringify` stands for what React does with the tree.
 */
const product = (over: Record<string, unknown> = {}) => ({
  id: "prod_published",
  title: "Мёд липовый",
  handle: "med-lipovyj",
  subtitle: "подзаголовок карточки",
  description: "полный текст карточки",
  status: "published",
  thumbnail: "https://example.test/honey.jpg",
  metadata: { course_page: { faq: [{ q: "вопрос курса", a: "ответ курса" }] } },
  variants: [{ id: "variant_1", sku: "HONEY-500" }],
  images: [{ id: "img_1", url: "https://example.test/honey-1.jpg" }],
  ...over,
})

const draft = product({
  id: "prod_draft",
  title: "Скрытая карточка",
  handle: "skrytaya-kartochka",
  description: "текст скрытой карточки",
  status: "draft",
})

describe("categoryProductRefs", () => {
  it("keeps one { id } per published product and nothing else of it", () => {
    expect(categoryProductRefs([product()])).toEqual([{ id: "prod_published" }])
  })

  it("removes every product whose status is not published", () => {
    const refs = categoryProductRefs([
      product(),
      draft,
      product({ id: "prod_proposed", status: "proposed" }),
      product({ id: "prod_rejected", status: "rejected" }),
      product({ id: "prod_null", status: null }),
    ])

    expect(refs).toEqual([{ id: "prod_published" }])
  })

  // A caller with a narrower `fields` list gets no `status`: the cut cannot tell a draft from
  // a published product there, and the menu's fallback must not go empty because of it.
  it("keeps a product that carries no status field, as its id alone", () => {
    expect(categoryProductRefs([{ id: "prod_bare", title: "название" }])).toEqual([
      { id: "prod_bare" },
    ])
  })
})

describe("withCategoryProductRefs", () => {
  const tree = {
    id: "pcat_parent",
    name: "Наборы",
    handle: "nabory",
    description: "описание самой категории",
    metadata: { image_url: "https://example.test/sets.jpg" },
    products: [product(), draft],
    parent_category: {
      id: "pcat_root",
      name: "Каталог",
      products: [draft],
      parent_category: { id: "pcat_top", name: "Всё", products: [product(), draft] },
    },
    category_children: [
      {
        id: "pcat_child",
        name: "Подарочные",
        products: [draft],
        category_children: [
          { id: "pcat_grandchild", name: "К празднику", products: [product(), draft] },
        ],
      },
    ],
  }

  const cut = withCategoryProductRefs(tree)
  const code = JSON.stringify(cut)

  it("leaves no draft and no product text anywhere in the tree", () => {
    expect(code).not.toContain("draft")
    expect(code).not.toContain("prod_draft")
    expect(code).not.toContain("Скрытая карточка")
    expect(code).not.toContain("текст скрытой карточки")
    expect(code).not.toContain("полный текст карточки")
    expect(code).not.toContain("подзаголовок карточки")
    expect(code).not.toContain("course_page")
    expect(code).not.toContain("вопрос курса")
    expect(code).not.toContain("HONEY-500")
    expect(code).not.toContain("honey-1.jpg")
    expect(code).not.toContain('"status"')
  })

  it("cuts the category itself, its children at every depth and its parent chain", () => {
    expect(cut.products).toEqual([{ id: "prod_published" }])
    expect(cut.category_children[0].products).toEqual([])
    expect(cut.category_children[0].category_children[0].products).toEqual([
      { id: "prod_published" },
    ])
    expect(cut.parent_category.products).toEqual([])
    expect(cut.parent_category.parent_category.products).toEqual([{ id: "prod_published" }])
  })

  it("keeps the category's own fields, its own description and metadata included", () => {
    expect(cut.id).toBe("pcat_parent")
    expect(cut.name).toBe("Наборы")
    expect(cut.handle).toBe("nabory")
    expect(cut.description).toBe("описание самой категории")
    expect(cut.metadata).toEqual({ image_url: "https://example.test/sets.jpg" })
    expect(cut.category_children[0].name).toBe("Подарочные")
  })

  it("does not change the answer it was given", () => {
    expect(tree.products).toHaveLength(2)
    expect(tree.products[1].description).toBe("текст скрытой карточки")
  })

  it("adds no products to a category that never carried them", () => {
    const bare = withCategoryProductRefs({ id: "pcat_bare", handle: "bare" })

    expect(bare).toEqual({ id: "pcat_bare", handle: "bare" })
    expect("products" in bare).toBe(false)
  })

  it("passes a value that is not a category through", () => {
    expect(withCategoryProductRefs(null)).toBeNull()
    expect(withCategoryProductRefs("pcat_1")).toBe("pcat_1")
  })
})
