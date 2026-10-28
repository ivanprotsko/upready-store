import type { TFunction } from "i18next"

import { formatCurrency } from "../../lib/format-currency.ts"

import type {
  AgentChangesetSummary,
  ChangesetAction,
  ChangesetKind,
  ChangesetSource,
  ChangesetStatus,
} from "../../hooks/api/agent-changesets"

// t-2026-10-27-04: plain-language labels for the raw enums of a changeset
// (rule 18e: a raw enum reaches the screen only through a label map). Every
// word is an `agentChanges.*` key in ru.json / en.json. Plain TS, free of
// React, so `src/__tests__/agent-changes.test.mjs` runs it as is.

export const CHANGESET_STATUS_COLOR: Record<ChangesetStatus, "blue" | "orange" | "green" | "grey" | "red"> = {
  draft: "grey",
  staged: "orange",
  published: "green",
  rolled_back: "blue",
  discarded: "grey",
}

export const changesetStatusLabel = (t: TFunction, status: ChangesetStatus): string =>
  t(`agentChanges.status.${status}`)

/** What the status means for the two sites, on hover of the badge. */
export const changesetStatusHint = (t: TFunction, status: ChangesetStatus): string =>
  t(`agentChanges.statusHint.${status}`)

export const changesetSourceLabel = (t: TFunction, source: ChangesetSource): string =>
  t(`agentChanges.source.${source}`)

export const changesetKindLabel = (t: TFunction, kind: ChangesetKind | "denied" | null): string =>
  t(`agentChanges.kind.${kind ?? "denied"}`)

/** «Главная, Товар»: what a changeset touches, each kind once. */
export const changesetWhat = (t: TFunction, row: Pick<AgentChangesetSummary, "summary" | "op_kinds">): string =>
  row.summary?.trim() || row.op_kinds.map((kind) => changesetKindLabel(t, kind)).join(", ")

/**
 * The moves a changeset offers, the main one first: a draft goes to the stage
 * site, a staged one is published, a published one rolled back. A draft or a
 * staged one may also be discarded; a rolled-back or discarded one is over.
 */
export const changesetActions = (status: ChangesetStatus): ChangesetAction[] => {
  switch (status) {
    case "draft":
      return ["stage", "discard"]
    case "staged":
      return ["publish", "discard"]
    case "published":
      return ["rollback"]
    default:
      return []
  }
}

/**
 * Every move but «Показать на stage» asks first: publishing and rolling back
 * touch the live site, discarding throws the agent's work away.
 */
export const CONFIRMED_ACTIONS: ChangesetAction[] = ["publish", "rollback", "discard"]

/** When the row last moved: the date of its current status. */
export const changesetWhen = (
  row: Pick<
    AgentChangesetSummary,
    "status" | "created_at" | "staged_at" | "published_at" | "rolled_back_at" | "discarded_at"
  >
): string | null => {
  switch (row.status) {
    case "staged":
      return row.staged_at ?? row.created_at
    case "published":
      return row.published_at ?? row.created_at
    case "rolled_back":
      return row.rolled_back_at ?? row.created_at
    case "discarded":
      return row.discarded_at ?? row.created_at
    default:
      return row.created_at
  }
}

/** An address on one of the two sites, or `null` when the site or the path is unknown. */
export const siteLink = (siteUrl: string | null | undefined, path: string | null | undefined): string | null =>
  siteUrl && path ? `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}` : null

const VALUE_MAX = 160

/**
 * A field's value as one line of text for the diff: a string as is, a number
 * or a flag in words, an object or a list as compact JSON cut to a readable
 * length. `null` and an empty string read «пусто».
 */
export const formatValue = (t: TFunction, value: unknown): string => {
  if (value === null || value === undefined || value === "") return t("agentChanges.diff.empty")
  if (typeof value === "boolean") return value ? t("agentChanges.diff.yes") : t("agentChanges.diff.no")
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX - 1)}…` : text
}

const listOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : []

/**
 * A field's value in the owner's words where the panel knows its shape:
 * prices as money («690,00 ₽»), photos as a count («3 фото»), categories by
 * name (the id while the names load or when one is gone). Any other field
 * goes through `formatValue`.
 */
export const formatFieldValue = (
  t: TFunction,
  field: string,
  value: unknown,
  categoryNames?: ReadonlyMap<string, string>
): string => {
  if (field === "prices" && Array.isArray(value)) {
    const prices = listOf(value)
      .filter((price) => Number.isFinite(Number(price.amount)) && typeof price.currency_code === "string")
      .map((price) => formatCurrency(Number(price.amount), String(price.currency_code).toUpperCase()))
    return prices.length ? prices.join(", ") : t("agentChanges.diff.empty")
  }
  if (field === "images" && Array.isArray(value)) {
    return value.length ? t("agentChanges.diff.photos", { count: value.length }) : t("agentChanges.diff.noPhotos")
  }
  if (field === "categories" && Array.isArray(value)) {
    const names = listOf(value).map((category) => categoryNames?.get(String(category.id)) ?? String(category.id))
    return names.length ? formatValue(t, names.join(", ")) : t("agentChanges.diff.noCategories")
  }
  return formatValue(t, value)
}

/** Category ids an op's diff names, before and after, for one names lookup. */
export const categoryIdsOf = (changes: { field: string; before: unknown; after: unknown }[]): string[] => [
  ...new Set(
    changes
      .filter((change) => change.field === "categories")
      .flatMap((change) => [...listOf(change.before), ...listOf(change.after)])
      .map((category) => String(category.id))
  ),
]

/** The field's name in words where the panel knows it, the raw key otherwise. */
const KNOWN_FIELDS = [
  "title",
  "subtitle",
  "description",
  "body",
  "published",
  "thumbnail",
  "images",
  "categories",
  "prices",
  "values",
  "theme",
  "settings",
  "content",
  "slug",
] as const

export const fieldLabel = (t: TFunction, field: string): string =>
  (KNOWN_FIELDS as readonly string[]).includes(field) ? t(`agentChanges.field.${field}`) : field
