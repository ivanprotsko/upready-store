import type { TenantPage, TenantPageKey } from "../../hooks/api/pages"

// tenant-panel wave 2, piece 7: the five content sections, in plain language.
// The panel has no Admin counterpart to copy for this screen, so the labels are
// written here rather than pulled from the Admin's i18n catalogue: the Admin has
// no string for "the shop's public offer". They are deliberately the words a
// shop owner would use, not the storage keys ("legal" is "Legal details", not
// "legal"), per the piece prompt and rule 18e.

export type PageSection = {
  key: TenantPageKey
  label: string
  hint: string
}

export const PAGE_SECTIONS: PageSection[] = [
  {
    key: "contacts",
    label: "Contacts",
    hint: "Address, phone, opening hours, how to reach you.",
  },
  {
    key: "legal",
    label: "Legal details",
    hint: "Company name, registration and tax numbers, bank details.",
  },
  {
    key: "about",
    label: "About the shop",
    hint: "Who you are and what you sell.",
  },
  {
    key: "privacy",
    label: "Privacy policy",
    hint: "What customer data you collect and what you do with it.",
  },
  {
    key: "offer",
    label: "Public offer",
    hint: "The terms a customer accepts when placing an order.",
  },
]

export const sectionOf = (key: string): PageSection | undefined =>
  PAGE_SECTIONS.find((section) => section.key === key)

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

export const STATUS_LABEL: Record<PageStatus, string> = {
  published: "Published",
  draft: "Draft",
  empty: "Empty",
}

export const STATUS_COLOR: Record<PageStatus, "green" | "orange" | "grey"> = {
  published: "green",
  draft: "orange",
  empty: "grey",
}
