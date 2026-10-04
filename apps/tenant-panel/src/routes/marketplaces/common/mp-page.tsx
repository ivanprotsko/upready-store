import { Container, Heading, Text } from "@medusajs/ui"
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
 */
export const MpPage = ({
  title,
  subtitle,
  actions,
  children,
  stacked,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Several containers one under another (analytics) instead of one divided container. */
  stacked?: boolean
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
          <Container className="p-0">{header}</Container>
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
