// tenant-panel: «Тексты секций» of the «Шаблоны» section (t-2026-10-12-33 PE2). The owner replaces the words of a
// template's sections; the apply sends them as `overrides.sections: [{ index, block, props }]` of
// `POST /tenants/home/template`, whose backend checks each block's props with a copy of the storefront's parser.
//
// Pure module, no React and no i18n, so `src/__tests__/home-template-texts.test.mjs` runs it as it is: the texts
// of a section's props, an edit written back at its path, the overrides of one apply, the shop's saved words
// carried over to the live template, the names of the fields and the backend's refusals by field.
//
// Only words change here. A list keeps its length and every image, link and number stays, except the channels of
// `newsletter/signup`: a channel with no address is not drawn, and every template ships them empty.

import type { CurrentTemplate, TemplateCard, TemplateChoice, TemplateOverrides } from "./templates.ts"
import { overridesFrom } from "./templates.ts"

export type SectionProps = Record<string, unknown>

/** The props of each section of a template by its place, as the owner has them now; undefined where none. */
export type SectionDraft = (SectionProps | undefined)[]

/**
 * One text of a section's props: where it stands (`header.heading`, `items[2].quote`, `facts[1]`), its leaf name
 * (`heading`, `quote`, `facts`), the nearest key above the leaf (`header`, `items`; null for a text at the top or
 * in a list at the top), the 1-based places of the lists on its way, and the words per language.
 */
export type SectionText = {
  path: string
  leaf: string
  parent: string | null
  numbers: number[]
  text: Record<string, string>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * A text: an object whose keys are all language codes of the catalogue's `locales` and whose values are strings.
 * The test `parity.test.ts` on the storefront uses, so the panel finds the texts the backend's parsers read.
 */
export function isText(value: unknown, locales: Iterable<string>): value is Record<string, string> {
  if (!isObject(value)) return false
  const codes = new Set(locales)
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(([code, line]) => codes.has(code) && typeof line === "string")
}

type Step = string | number

const pathOf = (steps: Step[]): string =>
  steps.reduce<string>((path, step) => (typeof step === "number" ? `${path}[${step}]` : path ? `${path}.${step}` : step), "")

const stepsOf = (path: string): Step[] =>
  [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((match) => (match[2] !== undefined ? Number(match[2]) : match[1]))

/** The texts of a section's props, depth first in the order the props give them. */
export function textsOf(props: unknown, locales: Iterable<string>): SectionText[] {
  const codes = [...locales]
  const texts: SectionText[] = []
  const walk = (value: unknown, steps: Step[]) => {
    if (isText(value, codes)) {
      const names = steps.filter((step): step is string => typeof step === "string")
      texts.push({
        path: pathOf(steps),
        leaf: names[names.length - 1] ?? "",
        // `header.heading` has `header` above it, `tabs[0].label` has `tabs`; `facts[1]` has none.
        parent: names.length > 1 ? names[names.length - 2] : null,
        numbers: steps.filter((step): step is number => typeof step === "number").map((step) => step + 1),
        text: { ...value },
      })
      return
    }
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...steps, index]))
    else if (isObject(value)) for (const [key, item] of Object.entries(value)) walk(item, [...steps, key])
  }
  walk(props, [])
  return texts
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The props with the words of one language of the text at `path` replaced; the props handed in stay as they were. */
export function withText<P>(props: P, path: string, lang: string, words: string): P {
  const next = copy(props)
  const steps = stepsOf(path)
  let node: unknown = next
  for (const step of steps) node = (node as Record<Step, unknown>)[step]
  if (!isObject(node)) throw new Error(`${path} is not a text of these props`)
  node[lang] = words
  return next
}

/* ------------------------------------------------------------------ the newsletter's channels */

export const CHANNEL_BLOCK = "newsletter/signup"

export type Network = "telegram" | "vk" | "max"

/** A channel of the shop in `newsletter/signup`: its place in `channels`, its network and its address. */
export type ChannelField = { index: number; network: Network; href: string | null }

/** The channels of a `newsletter/signup` section; none for any other block. */
export function channelsOf(block: string, props: unknown): ChannelField[] {
  if (block !== CHANNEL_BLOCK || !isObject(props) || !Array.isArray(props.channels)) return []
  return props.channels.flatMap((channel, index) =>
    isObject(channel) && typeof channel.network === "string"
      ? [{ index, network: channel.network as Network, href: typeof channel.href === "string" ? channel.href : null }]
      : []
  )
}

/** The props with channel `index` at `href`, trimmed; an empty address is null, which keeps the channel hidden. */
export function withChannel<P>(props: P, index: number, href: string): P {
  const next = copy(props) as P & { channels: Array<Record<string, unknown>> }
  next.channels[index].href = href.trim() ? href.trim() : null
  return next
}

/** The channel's field path in a refusal of the backend: `channels[0].href`. */
export const channelPath = (index: number): string => `channels[${index}].href`

/* ------------------------------------------------------------------ the draft and its overrides */

/** Equal as JSON: arrays in order, object keys in any order; the backend's `sameJson`. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameJson(value, b[index]))
  }
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameJson(a[key], b[key]))
  }
  return a === b
}

/** A saved section whose words cannot go over to the card: its place, its block and its kind, for one line. */
export type DroppedSection = { index: number; block: string; category: string }

/**
 * Where the texts open. Another template: its own props. The live template: the shop's saved props of each
 * section whose index and block still match the card's (a storefront update may have changed the template), so
 * applying it again sends them back and a palette change keeps the owner's words. A saved section with props that
 * does not match is dropped and named, unless the card holds the same block with the same props somewhere, which
 * means it held the template's own words and nothing of the owner's is lost.
 */
export function draftOf(card: TemplateCard, current: CurrentTemplate | null): { draft: SectionDraft; dropped: DroppedSection[] } {
  const own = card.sections.map((section) => section.props)
  if (!current || current.id !== card.id) return { draft: own, dropped: [] }

  const saved = current.sections ?? []
  const matches = (index: number) => {
    const section = card.sections[index]
    return Boolean(section && saved[index] && section.block === saved[index].block && section.editable)
  }
  const draft = card.sections.map((section, index) =>
    matches(index) && saved[index].props !== undefined ? saved[index].props : section.props
  )
  const dropped = saved.flatMap((section, index) => {
    if (section.props === undefined || matches(index)) return []
    const sample = card.sections.some((other) => other.block === section.block && sameJson(other.props, section.props))
    return sample ? [] : [{ index, block: section.block, category: section.category }]
  })
  return { draft, dropped }
}

/** True when the section holds the template's own props, so «Вернуть текст шаблона» has nothing to do. */
export const isSectionOwn = (card: TemplateCard, index: number, draft: SectionDraft): boolean =>
  sameJson(draft[index], card.sections[index]?.props)

/** One `{ index, block, props }` per editable section whose props differ from the template's own. */
export function sectionOverrides(card: TemplateCard, draft: SectionDraft): NonNullable<TemplateOverrides["sections"]> {
  return card.sections.flatMap((section, index) => {
    const props = draft[index]
    return section.editable && props !== undefined && !sameJson(props, section.props)
      ? [{ index, block: section.block, props }]
      : []
  })
}

/** The overrides of one apply: the palette and layers as before (`overridesFrom`), plus the edited sections. */
export function overridesWithTexts(
  card: TemplateCard,
  choice: TemplateChoice,
  draft: SectionDraft
): TemplateOverrides | undefined {
  const look = overridesFrom(card, choice)
  const sections = sectionOverrides(card, draft)
  if (!sections.length) return look
  return { ...look, sections }
}

/* ------------------------------------------------------------------ the editor's fields */

/** Leaves whose words run to sentences: a text area, not a line. */
export const LONG_TEXT_LEAVES: ReadonlySet<string> = new Set(["quote", "answer", "text", "lead", "note", "paragraphs"])

/** Past this many characters in any language a text takes a text area, whatever its leaf. */
export const LONG_TEXT_CHARS = 90

export const isLongText = (field: Pick<SectionText, "leaf" | "text">): boolean =>
  LONG_TEXT_LEAVES.has(field.leaf) || Object.values(field.text).some((line) => line.length > LONG_TEXT_CHARS)

/** A text area's rows: the longest language's words at about 55 characters a row, from 3 to 8. */
export const textRows = (field: Pick<SectionText, "text">): number =>
  Math.min(8, Math.max(3, Math.ceil(Math.max(0, ...Object.values(field.text).map((line) => line.length)) / 55)))

/**
 * The i18n keys of a field's name under `homeSettings.templates.texts`, the first one found wins: the name of
 * the leaf under its parent (`fieldsIn.seeAll.label`, «Ссылка на все»), then the leaf's own (`fields.label`).
 * `home-template-texts.test.mjs` fails when a text of any catalogue template has neither in ru or en.
 */
export const fieldLabelKeys = (field: Pick<SectionText, "leaf" | "parent">): string[] =>
  field.parent ? [`fieldsIn.${field.parent}.${field.leaf}`, `fields.${field.leaf}`] : [`fields.${field.leaf}`]

/* ------------------------------------------------------------------ a refusal at its field */

/** A refusal of one section's props: its place, the field it names (`items[0].quote.ru`) and the parser's words. */
export type SectionRefusal = { index: number; field: string; message: string }

const SECTION_REFUSAL = /sections\[(\d+)\]\.props: /g

/**
 * The backend's 400 (`POST /tenants/home/template` joins `<field>: <message>` with a space) split into refusals of
 * sections' props, by section and the path each message starts with; whatever stands before the first of them
 * (another field's refusal) is `rest`, for the toast.
 */
export function refusalsOf(message: string): { sections: SectionRefusal[]; rest: string } {
  const marks = [...message.matchAll(SECTION_REFUSAL)]
  if (!marks.length) return { sections: [], rest: message.trim() }
  const sections = marks.map((mark, n) => {
    const start = (mark.index ?? 0) + mark[0].length
    const end = n + 1 < marks.length ? marks[n + 1].index : message.length
    const text = message.slice(start, end).trim()
    const field = text.match(/^[^\s:]+/)?.[0] ?? ""
    return { index: Number(mark[1]), field, message: text }
  })
  return { sections, rest: message.slice(0, marks[0].index).trim() }
}

/** `… is 5000 characters, at most 400`: the length now and the limit, for the owner's words; null for any other. */
export function lengthRefusal(message: string): { now: number; max: number } | null {
  const match = message.match(/ is (\d+) characters, at most (\d+)$/)
  return match ? { now: Number(match[1]), max: Number(match[2]) } : null
}

/**
 * `channels[1].href must lead to a channel on vk.com or vk.ru for vk` (`onNetwork` of `newsletter/signup`): the
 * network's hosts, for the owner's words; null for any other refusal.
 */
export function channelRefusal(message: string): string[] | null {
  const match = message.match(/ must lead to a channel on (.+) for [a-z]+$/)
  return match ? match[1].split(" or ") : null
}
