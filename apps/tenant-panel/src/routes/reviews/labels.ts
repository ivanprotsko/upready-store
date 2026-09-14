import type { ReviewSource, ReviewStatus } from "../../hooks/api/reviews"

// Plain-language labels for the raw enums the backend stores (rule 18e: a raw
// enum reaches the screen only through a label map).

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "На проверке",
  published: "Опубликован",
  hidden: "Скрыт",
}

export const REVIEW_STATUS_HINT: Record<ReviewStatus, string> = {
  pending: "Покупатель оставил отзыв на витрине. На странице товара его пока не видно.",
  published: "Отзыв виден всем на странице товара и учитывается в средней оценке.",
  hidden: "Отзыв убран со страницы товара, но сохранён — его можно вернуть.",
}

export const REVIEW_STATUS_COLOR: Record<ReviewStatus, "orange" | "green" | "grey"> = {
  pending: "orange",
  published: "green",
  hidden: "grey",
}

export const REVIEW_SOURCE_LABEL: Record<ReviewSource, string> = {
  shop: "С витрины",
  imported: "Перенесён из старого магазина",
}

const LANGUAGE_LABEL: Record<string, string> = {
  ru: "русский",
  en: "английский",
  de: "немецкий",
  fr: "французский",
  es: "испанский",
  it: "итальянский",
  uk: "украинский",
}

/** «русский» where the panel knows the tag, the tag itself otherwise. */
export const languageLabel = (tag: string): string =>
  LANGUAGE_LABEL[tag.toLowerCase()] ?? tag

/**
 * «11 сентября 2026» — the date the review was written, in the owner's
 * language. `null` in, «дата неизвестна» out: 9 of the imported reviews carry
 * a date the import could not read, and the row says so instead of showing the
 * day it was copied over.
 */
export const formatReviewDate = (iso: string | null): string => {
  if (!iso) return "дата неизвестна"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}
