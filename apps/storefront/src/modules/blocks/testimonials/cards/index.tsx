import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import BlockIcon from "../../shared/block-icon"
import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import TestimonialsCarousel from "./carousel"
import { LIST_LABEL, NEXT_LABEL, PREVIOUS_LABEL, RATING_LABEL, type TestimonialsCardsProps } from "./props"

type Card = { quote: string; name: string | null; city: string | null; rating: number | null }

/** Five stars, the first `rating` of them filled with the theme's `--primary`; one label for all five. */
function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <div data-role="star-rating" role="img" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((position) => (
        <BlockIcon
          key={position}
          name="star"
          className={clx(
            "size-4",
            position <= rating ? "fill-[var(--primary)] text-[var(--primary)]" : "fill-none text-ui-fg-disabled"
          )}
        />
      ))}
    </div>
  )
}

/**
 * `testimonials/cards` (t-2026-10-12-33, R1 build list item 5): what buyers say about the shop, in
 * the shop's own words. A Russian buyer reads reviews first. Each card is a `figure`: the stars, the
 * quote as a `blockquote`, then the first name and the city; a grid of every card, or one row that
 * scrolls sideways (`./carousel.tsx`). Measured against the Shopify catalogue's testimonials row
 * (Motion: cards with stars, a quote, a name and a city, three to a row at 1280, a slider).
 *
 * Static: the owner writes the testimonials into the template. Reading the shop's product reviews
 * is a later mode.
 *
 * The sizes keep to the lab's scale (`pnpm template:check`) and to the shell's header
 * (`shared/section-type.ts`): the quote 16 px, 18 px from `small`, the size of the section's
 * description; the name and the city 12 px (the name in capitals with 0.08em of tracking, as QR-CASE
 * asks), so a section reads 12 / 16 / 24 px at 360 and 12 / 18 / 32 px from 1024. The grid is 1
 * column on a phone, 2 from 512, 3 from 1024; two or four cards stay 2 across, so no card is left
 * alone on a row.
 *
 * With no quote in the visitor's language, nor in English, nor in any other, it draws nothing.
 */
export default async function TestimonialsCards({
  header,
  items,
  layout,
  showRating,
  ratingLabel,
  listLabel,
  previousLabel,
  nextLabel,
}: TestimonialsCardsProps) {
  const locale = await getLocale()
  const cards = items.flatMap((item): Card[] => {
    const quote = pickText(item.quote, locale)
    return quote
      ? [{ quote, name: pickText(item.name, locale), city: pickText(item.city, locale), rating: item.rating }]
      : []
  })

  if (cards.length === 0) {
    return null
  }

  const stars = pickText(ratingLabel, locale) ?? pickText(RATING_LABEL, locale)!
  const carousel = layout === "carousel"

  const list = cards.map((card, index) => (
    <li
      key={index}
      className={clx(
        "flex",
        carousel && "w-[85%] shrink-0 snap-start xsmall:w-[calc((100%-1rem)/2)] small:w-[calc((100%-3rem)/3)]"
      )}
    >
      <figure
        data-role="testimonial-card"
        className="flex w-full flex-col gap-[var(--layer-space-4,1rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] small:p-8"
      >
        {showRating && card.rating ? (
          <Stars rating={card.rating} label={stars.replace("{rating}", String(card.rating))} />
        ) : null}
        <blockquote data-role="quote-text" className="flex-1 text-pretty text-base leading-relaxed small:text-lg">
          {card.quote}
        </blockquote>
        {card.name || card.city ? (
          <figcaption data-role="author-info" className="flex flex-col gap-1 text-xs">
            {card.name ? (
              <span className="font-medium uppercase tracking-[0.08em]">{card.name}</span>
            ) : null}
            {card.city ? <span className="text-ui-fg-subtle">{card.city}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    </li>
  ))

  return (
    <BlockSection block="testimonials/cards" locale={locale} header={header}>
      {carousel ? (
        <TestimonialsCarousel
          label={pickText(listLabel, locale) ?? pickText(LIST_LABEL, locale)!}
          previousLabel={pickText(previousLabel, locale) ?? pickText(PREVIOUS_LABEL, locale)!}
          nextLabel={pickText(nextLabel, locale) ?? pickText(NEXT_LABEL, locale)!}
        >
          {list}
        </TestimonialsCarousel>
      ) : (
        <ul
          className={clx(
            "grid grid-cols-1 gap-4 xsmall:grid-cols-2 small:gap-6",
            cards.length !== 2 && cards.length !== 4 && "small:grid-cols-3"
          )}
        >
          {list}
        </ul>
      )}
    </BlockSection>
  )
}
