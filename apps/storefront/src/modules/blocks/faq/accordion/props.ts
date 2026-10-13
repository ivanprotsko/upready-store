import type { PropsResult } from "../../types"
import { parseImageRef, type ImageRef } from "../../shared/image-ref"
import type { LocalizedText } from "../../shared/localized-text"
import { parseBoolean, parseEnum, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseSectionHeader, type SectionHeader } from "../../shared/section-header"

/** One question and its answer, the answer plain text whose line breaks are kept. */
export type FaqItem = {
  question: LocalizedText
  answer: LocalizedText
}

export type FaqAccordionProps = {
  header: SectionHeader | null
  /** None (the empty state), or 1 to 20. */
  items: FaqItem[]
  /** A product's or a category's picture, or a file of the template; drawn only in `two-column`. */
  image: ImageRef | null
  /** `two-column`: the picture beside the questions from 1024 px, the questions alone below. */
  layout: "single" | "two-column"
  /** The first answer stands open when the page loads. */
  openFirst: boolean
}

const MAX_ITEMS = 20

const parseItem = (value: unknown, path: string) =>
  parseObject<FaqItem>(value, path, {
    question: (question, questionPath) => parseLocalizedText(question, questionPath, { max: 160 }),
    answer: (answer, answerPath) => parseLocalizedText(answer, answerPath, { max: 1000 }),
  })

export function parseFaqAccordionProps(input: unknown): PropsResult<FaqAccordionProps> {
  return parseProps<FaqAccordionProps>(input, "faq/accordion", {
    header: (value, path) => parseSectionHeader(value, path),
    items: (value, path) => parseList(value, path, parseItem, { max: MAX_ITEMS, fallback: [] }),
    image: (value, path) => parseImageRef(value, path, { optional: true }),
    layout: (value, path) => parseEnum(value, path, ["single", "two-column"] as const, { fallback: "single" }),
    openFirst: (value, path) => parseBoolean(value, path, { fallback: false }),
  })
}
