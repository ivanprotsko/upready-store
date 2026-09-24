import { getSiteName } from "@lib/data/cookies"
import type { HomeHeroProps } from "@modules/home/variants/types"

/**
 * Cover · Olavka (t-2026-09-24-n15), Figma 227:9296: a white band, padding 48 top and
 * bottom, one centred PT Serif Italic 32px / 44.8 text block at most 850px wide — the
 * first line bold («Лавка Оксаны Черкашиной»), the second regular («кладезь знаний и
 * продуктов для здоровья»), ink #1a1b09.
 *
 * Data (real tenant fields, nothing hard-coded): line 1 is the shop's name
 * (`getSiteName()`, the tenant's `name`); line 2 is the headline of the tenant's home
 * document (`content.hero.title`, already in the visitor's language — handed down by
 * `(main)/page.tsx` as `HomeHeroProps.title`), because the document has no `tagline`
 * field yet — the node's second line is a tagline, so that field is a TODO for the panel
 * and this line is reported as the substitution it is. No headline → one line.
 *
 * Below 1024px (no mobile frame in the file): 22px, padding 32.
 */
export default async function OlavkaCover({ title }: HomeHeroProps) {
  const siteName = await getSiteName()

  return (
    <section
      className="bg-[var(--background)] px-4 py-8 lg:py-12"
      data-testid="olavka-cover"
    >
      <p
        className="mx-auto max-w-[850px] text-balance text-center italic text-[22px] leading-[1.4] text-[var(--foreground)] lg:text-[32px]"
        style={{ fontFamily: "var(--font-olavka-serif), Georgia, serif" }}
      >
        <strong className="font-bold" data-testid="olavka-cover-title">
          {siteName}
        </strong>
        {title ? (
          <>
            <br />
            <span data-testid="olavka-cover-line">{title}</span>
          </>
        ) : null}
      </p>
    </section>
  )
}
