import type { TenantPage, TenantPageKey } from "../../hooks/api/pages"

// tenant-panel wave 2, piece 7: the five content sections, in plain language.
// The panel has no Admin counterpart to copy for this screen, so the labels are
// written here rather than pulled from the Admin's i18n catalogue: the Admin has
// no string for "the shop's public offer". They are deliberately the words a
// shop owner would use, not the storage keys ("legal" is "Реквизиты", not
// "legal"), per the piece prompt and rule 18e. Written in Russian: the panel
// serves Russian shop owners and every neighbouring screen is Russian.

export type PageSection = {
  key: TenantPageKey
  label: string
  hint: string
}

export const PAGE_SECTIONS: PageSection[] = [
  {
    key: "contacts",
    label: "Контакты",
    hint: "Адрес, телефон, часы работы, как вас найти.",
  },
  {
    key: "legal",
    label: "Реквизиты",
    hint: "Название, регистрационные и налоговые номера, банковские реквизиты.",
  },
  {
    key: "about",
    label: "О магазине",
    hint: "Кто вы и что продаёте.",
  },
  {
    key: "privacy",
    label: "Политика конфиденциальности",
    hint: "Какие данные покупателей вы собираете и что с ними делаете.",
  },
  {
    key: "offer",
    label: "Публичная оферта",
    hint: "Условия, которые покупатель принимает, оформляя заказ.",
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
  published: "Опубликована",
  draft: "Черновик",
  empty: "Пусто",
}

export const STATUS_COLOR: Record<PageStatus, "green" | "orange" | "grey"> = {
  published: "green",
  draft: "orange",
  empty: "grey",
}
