import Image from "next/image"

import { Link } from "@i18n/navigation"
import type { TenantArticleSummary } from "@lib/data/tenant-articles"

/**
 * One article of the shop's journal as a card (ask d11e): the cover, the rubric, the title
 * and the excerpt, the whole card one link to the article. After the «Журнал здоровья»
 * cards of the old Cherkashina shop (Ivan's frame of 2026-09-25), painted with the theme's
 * own tokens: no card chrome around the text, no «read» button, no date.
 *
 * The cover's `alt` is empty on purpose: the title is the link's own text right under it,
 * and a screen reader would otherwise say it twice.
 */
export default function JournalCard({
  article,
  sizes,
  clone = false,
  "data-testid": dataTestid = "journal-card",
}: {
  article: Pick<TenantArticleSummary, "slug" | "title" | "excerpt" | "cover_url" | "category">
  /** What the browser fetches for the cover: the card's rendered width per breakpoint. */
  sizes: string
  /** A carousel's loop clone: clickable, never reached by Tab. */
  clone?: boolean
  "data-testid"?: string
}) {
  return (
    <Link
      href={`/journal/${article.slug}`}
      className="group flex w-full flex-col gap-3 rounded-rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive small:gap-4"
      tabIndex={clone ? -1 : undefined}
      data-testid={dataTestid}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-rounded border border-ui-border-base bg-ui-bg-subtle">
        {article.cover_url ? (
          <Image
            src={article.cover_url}
            alt=""
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : null}
      </div>
      {article.category ? (
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-ui-fg-muted">
          {article.category}
        </span>
      ) : null}
      <h3 className="text-balance text-base font-medium leading-snug text-ui-fg-base transition-colors duration-200 group-hover:text-ui-fg-interactive small:text-lg medium:text-xl">
        {article.title}
      </h3>
      {article.excerpt ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-ui-fg-subtle medium:text-base">
          {article.excerpt}
        </p>
      ) : null}
    </Link>
  )
}
