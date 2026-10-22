import { Container, Heading, Text, clx } from "@medusajs/ui"
import { ReactNode } from "react"

import { SingleColumnPage } from "../../../components/layout/pages"

/**
 * The page shell of a marketplace screen (mp-section-design): the one
 * `Container` of «Товары» of the shop, a heading row with the actions on the
 * right and one line of context under the heading, then whatever the screen
 * puts below the divider (a `_DataTable`, a table, cards).
 *
 * On a phone the actions wrap under the heading and stretch, the way the
 * «Добавить товар» row of the shop's products does (o21, P6).
 *
 * `bar` is a control row that belongs to the heading on every width (the
 * period of «Аналитика», t-2026-10-20-29): it is not stretched under the
 * heading on a phone, the screen gives it its own phone shape. With `sticky`
 * the heading container stays at the top of the scrolling area while the page
 * scrolls, the way Yandex Metrica keeps its period bar; stacked pages only.
 */
export const MpPage = ({
  title,
  subtitle,
  actions,
  bar,
  children,
  stacked,
  sticky,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  bar?: ReactNode
  children: ReactNode
  /** Several containers one under another (analytics) instead of one divided container. */
  stacked?: boolean
  /** The heading container sticks to the top of `main` while the rest scrolls (stacked only). */
  sticky?: boolean
}) => {
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
      <div className="flex min-w-0 flex-col gap-y-1">
        <Heading level="h1">{title}</Heading>
        {subtitle ? (
          <Text size="small" className="text-ui-fg-subtle">
            {subtitle}
          </Text>
        ) : null}
      </div>
      {bar}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-md:w-full [&>a]:max-md:min-h-11 [&>a]:max-md:flex-1 [&>button]:max-md:min-h-11 [&>button]:max-md:flex-1">
          {actions}
        </div>
      ) : null}
    </div>
  )

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      {stacked ? (
        <>
          <Container className={clx("p-0", sticky && "sticky top-0 z-10")}>{header}</Container>
          {children}
        </>
      ) : (
        <Container className="divide-y p-0">
          {header}
          {children}
        </Container>
      )}
    </SingleColumnPage>
  )
}
