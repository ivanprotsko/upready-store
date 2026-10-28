import { DISPLAY_TITLE } from "@modules/journal/typography"

/**
 * The journal's masthead (t-2026-10-05-03), after the chrxnasdmds «Журнал здоровья»: the
 * title centred between two hairlines, a subtitle under it.
 */
export default function Masthead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <header className="flex flex-col items-center gap-4 py-10 small:py-14" data-testid="journal-masthead">
      <div className="flex w-full items-center gap-4 small:gap-8">
        <span aria-hidden className="h-px flex-1 bg-ui-border-base" />
        <h1
          className={`${DISPLAY_TITLE} text-center text-ui-fg-base`}
          data-testid="journal-heading"
        >
          {title}
        </h1>
        <span aria-hidden className="h-px flex-1 bg-ui-border-base" />
      </div>
      {subtitle ? (
        <p className="max-w-2xl text-balance text-center text-base text-ui-fg-subtle small:text-lg">
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}
