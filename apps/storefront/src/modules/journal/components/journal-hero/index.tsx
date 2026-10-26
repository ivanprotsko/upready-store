import { Link } from "@i18n/navigation"
import type { TenantArticleSummary } from "@lib/data/tenant-articles"
import ArticleCover from "@modules/journal/components/article-cover"
import { DISPLAY_TITLE, EYEBROW } from "@modules/journal/typography"

type HeroArticle = Pick<TenantArticleSummary, "slug" | "title" | "excerpt" | "cover_url" | "category">

/**
 * The top of the journal page (t-2026-10-05-03), after the chrxnasdmds hero: the newest
 * article large on seven columns, the next two beside it on five, one under the other with
 * a hairline between. On a phone they stack. No author line: the shop's articles carry no
 * byline the journal could show (`content-contract.md`).
 */
export default function JournalHero({
  main,
  aside,
}: {
  main: HeroArticle
  aside: HeroArticle[]
}) {
  return (
    <section className="grid grid-cols-1 gap-6 small:grid-cols-12 small:gap-8" data-testid="journal-hero">
      <Link
        href={`/journal/${main.slug}`}
        className="group flex flex-col gap-5 rounded-rounded small:col-span-7"
        data-testid="journal-hero-main"
      >
        <ArticleCover
          src={main.cover_url}
          aspect="aspect-[16/10]"
          sizes="(max-width: 1023px) 100vw, 58vw"
          priority
        />
        {main.category ? (
          <span className={`${EYEBROW} text-ui-fg-interactive`}>{main.category}</span>
        ) : null}
        <h2
          className={`${DISPLAY_TITLE} text-balance text-ui-fg-base transition-colors group-hover:text-ui-fg-interactive`}
        >
          {main.title}
        </h2>
        {main.excerpt ? (
          <p className="max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
            {main.excerpt}
          </p>
        ) : null}
      </Link>

      {aside.length > 0 ? (
        <ul className="flex flex-col divide-y divide-ui-border-base small:col-span-5">
          {aside.map((article, index) => (
            <li key={article.slug} className={index > 0 ? "pt-6 small:pt-8" : "pb-6 small:pb-8"}>
              <Link
                href={`/journal/${article.slug}`}
                className="group flex flex-col gap-4 rounded-rounded"
                data-testid="journal-hero-aside"
              >
                <ArticleCover
                  src={article.cover_url}
                  aspect="aspect-[16/10]"
                  sizes="(max-width: 1023px) 100vw, 40vw"
                />
                {article.category ? (
                  <span className={`${EYEBROW} text-ui-fg-interactive`}>{article.category}</span>
                ) : null}
                <h3 className="text-balance text-lg font-medium leading-snug text-ui-fg-base transition-colors group-hover:text-ui-fg-interactive medium:text-xl">
                  {article.title}
                </h3>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
