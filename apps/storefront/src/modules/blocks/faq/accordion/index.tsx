import { clx } from "@medusajs/ui"
import { ChevronDown } from "lucide-react"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { resolveImageRef } from "@lib/data/block-image"
import JsonLd from "@modules/common/components/json-ld"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { FaqAccordionProps } from "./props"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/**
 * `faq/accordion` (t-2026-10-12-33, R1 build list item 10): questions and answers, the
 * `collapsible-content` section of Shopify's Dawn family, for delivery, payment and returns on
 * home and later on a product page.
 *
 * - Every question is a native `<details>`/`<summary>`: a click, Enter or Space opens it with JS
 *   off, and a screen reader hears it expanded or collapsed with no state to keep in sync. The
 *   chevron (lucide, as BLOCK-CONTRACT.md §3 allows: `BlockIcon`'s list has none) turns on the
 *   open one. `openFirst` opens the first answer on load.
 * - The answer is plain text, its line breaks kept, at most 65ch wide; the question type is the
 *   shell's description size, 16 px and 18 px from 1024, so the section adds no size of its own
 *   (QR-TYPE-SCALE). The question stands out by weight and colour.
 * - `single`: one column at a reading width. `two-column`: from 1024 px the picture (`ImageRef`,
 *   in the template's photo ratio) stands left of the questions; below 1024 the questions stand
 *   alone, and the lazy picture in its hidden frame is not fetched. No picture: one column.
 * - `FAQPage` JSON-LD carries exactly the questions drawn, in the words the visitor reads.
 *
 * A question or an answer with no words in any language is not drawn; with none left the block
 * draws nothing, and puts no JSON-LD in the page.
 */
export default async function FaqAccordion({ header, items, image, layout, openFirst }: FaqAccordionProps) {
  const locale = await getLocale()
  const shown = items.flatMap((item) => {
    const question = pickText(item.question, locale)
    const answer = pickText(item.answer, locale)
    return question && answer ? [{ question, answer }] : []
  })

  if (!shown.length) {
    return null
  }

  const picture = layout === "two-column" && image ? await resolveImageRef(image, locale) : null

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: shown.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  }

  const list = (
    <div className={clx("divide-y divide-[var(--border)] border-y border-[var(--border)]", !picture && "max-w-3xl")}>
      {shown.map(({ question, answer }, index) => (
        <details key={index} className="group" open={openFirst && index === 0}>
          <summary
            data-role="trigger"
            className={clx(
              "group/summary flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-[var(--layer-space-4,1rem)] text-base font-medium text-ui-fg-base small:text-lg [&::-webkit-details-marker]:hidden",
              focusRing
            )}
          >
            <span className="min-w-0 max-w-prose text-pretty underline-offset-4 group-hover/summary:underline">{question}</span>
            <ChevronDown
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
              className="size-5 shrink-0 text-ui-fg-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <p
            data-role="content"
            className="max-w-prose whitespace-pre-line pb-[var(--layer-space-4,1rem)] text-base leading-relaxed text-ui-fg-subtle small:text-lg"
          >
            {answer}
          </p>
        </details>
      ))}
    </div>
  )

  return (
    <BlockSection block="faq/accordion" locale={locale} header={header}>
      {picture ? (
        <div className="grid grid-cols-1 small:grid-cols-[2fr_3fr] small:items-start small:gap-x-12">
          <div data-role="media" className="relative hidden overflow-hidden rounded-[var(--radius)] bg-[var(--muted)] small:block">
            <div aria-hidden="true" className="aspect-[var(--layer-photo-aspect,1/1)]" />
            <Image src={picture.url} alt={picture.alt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          </div>
          {list}
        </div>
      ) : (
        list
      )}
      <JsonLd data={faqPage} />
    </BlockSection>
  )
}
