import type { ReservedPageKey, TenantPage } from "../../hooks/api/pages"

// tenant-panel wave 2, piece 7: the five reserved content sections. Their
// words (label, hint) are catalogue keys `contentPages.sections.<key>`, in the
// words a shop owner would use, not the storage keys ("legal" is
// «Реквизиты», not "legal").
//
// t05-page-keys (2026-09-16): these five no longer exhaust the vocabulary — a
// tenant's own custom pages (`TenantPage.reserved === false`) have no entry
// here and show their own title.
//
// t-2026-10-14-01 (panel redesign, G4): free of React and of the catalogue, so
// `src/__tests__/pages-journal-g4.test.mjs` runs it as is.

export const PAGE_SECTION_KEYS: ReservedPageKey[] = ["contacts", "legal", "about", "privacy", "offer"]

/** The shape the «Обзор» checklists read (`routes/home/owner-*.tsx`): only the key. */
export const PAGE_SECTIONS: Array<{ key: ReservedPageKey }> = PAGE_SECTION_KEYS.map((key) => ({ key }))

export const isSectionKey = (key: string): key is ReservedPageKey =>
  (PAGE_SECTION_KEYS as string[]).includes(key)

export type PageStatus = "published" | "draft" | "empty"

/**
 * Three states, not two: a section nobody has touched ("Empty") reads
 * differently from a saved draft the owner is still writing ("Draft"). The
 * storefront shows neither — only "Published" is public.
 */
export const statusOf = (page: TenantPage): PageStatus => {
  if (page.published) {
    return "published"
  }

  if (!page.id || (!page.title.trim() && !page.body.trim())) {
    return "empty"
  }

  return "draft"
}

export const STATUS_COLOR: Record<PageStatus, "green" | "orange" | "grey"> = {
  published: "green",
  draft: "orange",
  empty: "grey",
}

/** The reserved five first, in their fixed order, then the owner's own pages. */
export const orderedPages = (pages: TenantPage[]): TenantPage[] => {
  const reserved = PAGE_SECTION_KEYS.map((key) => pages.find((page) => page.key === key)).filter(
    (page): page is TenantPage => !!page
  )
  return [...reserved, ...pages.filter((page) => !isSectionKey(page.key))]
}

/**
 * The links of the footer, in the order the storefront draws them
 * (`GET /store/tenant/pages`): published pages marked «в подвале», ascending
 * `footer_order` (none sorts last), then title.
 */
export const footerPages = (pages: TenantPage[]): TenantPage[] =>
  pages
    .filter((page) => page.published && page.in_footer)
    .sort((a, b) => {
      const orderA = a.footer_order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.footer_order ?? Number.MAX_SAFE_INTEGER
      return orderA !== orderB ? orderA - orderB : a.title.localeCompare(b.title)
    })

/** The place of a page in the footer, 1-based; `null` when it is not there. */
export const footerPlace = (pages: TenantPage[], key: string): number | null => {
  const index = footerPages(pages).findIndex((page) => page.key === key)
  return index === -1 ? null : index + 1
}

/**
 * The footer after one page moves a step up or down: every link with its new
 * `footer_order` (1, 2, 3 …). Only the links whose number changed are written,
 * so the move works also when two pages were saved with no order or the same
 * one, which a plain swap of two values left as it was.
 */
export const moveInFooter = (
  pages: TenantPage[],
  key: string,
  direction: "up" | "down"
): Array<{ page: TenantPage; footer_order: number }> => {
  const list = footerPages(pages)
  const from = list.findIndex((page) => page.key === key)
  const to = direction === "up" ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= list.length) {
    return []
  }

  const next = [...list]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
    .map((page, index) => ({ page, footer_order: index + 1 }))
    .filter(({ page, footer_order }) => page.footer_order !== footer_order)
}

/** Lowercase latin letters, digits and single hyphens, 2–48 long: the backend's own rule. */
export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `/pages/create` is the create modal's own address. */
export const RESERVED_PAGE_SLUGS = ["create", ...PAGE_SECTION_KEYS]

/**
 * Why an address cannot be a new page's, as a catalogue key; `null` when it can.
 * A taken address is told here rather than by the backend's 409, next to the field.
 */
export const pageSlugProblem = (
  slug: string,
  taken: string[]
): "slug" | "slugReserved" | null => {
  if (slug.length < 2 || slug.length > 48 || !PAGE_SLUG_PATTERN.test(slug)) {
    return "slug"
  }
  if (RESERVED_PAGE_SLUGS.includes(slug) || taken.includes(slug)) {
    return "slugReserved"
  }
  return null
}
