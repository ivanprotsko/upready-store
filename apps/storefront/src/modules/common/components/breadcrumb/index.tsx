import { Fragment } from "react"
import { TriangleRightMini } from "@medusajs/icons"
import { Link } from "@i18n/navigation"

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
  /**
   * `trail` (default): a left-aligned line above a page's content.
   * `pill`: one outlined capsule with slashes between the links, the way the product
   * page hangs its trail on the top edge of the centre card (Ivan's Figma mockup).
   * The caller positions the pill; this renders only the capsule.
   */
  variant?: "trail" | "pill"
}

const Breadcrumb = ({ items, variant = "trail" }: BreadcrumbProps) => {
  if (variant === "pill") {
    return (
      <nav
        className="inline-flex max-w-full items-center gap-x-1.5 whitespace-nowrap rounded-full border border-ui-border-base bg-ui-bg-base px-3.5 py-1 text-[13px] leading-5 text-ui-fg-muted shadow-elevation-card-rest"
        data-testid="breadcrumb-pill"
      >
        {items.map((item, index) => (
          <Fragment key={index}>
            {index > 0 && <span aria-hidden>/</span>}
            {item.href ? (
              <Link href={item.href} className="shrink-0 transition-colors hover:text-ui-fg-base">
                {item.label}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-ui-fg-base" title={item.label} aria-current="page">
                {item.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>
    )
  }

  return (
    // One line at any width: the trail's links keep their size and the current page, the
    // last and longest item, gives way with an ellipsis. Wrapping left an orphan arrow at
    // the start of the second line on a phone.
    <nav className="mb-8 flex min-w-0 items-center gap-1 text-sm text-ui-fg-muted">
      {items.map((item, index) => (
        <span
          key={index}
          className={item.href ? "flex shrink-0 items-center gap-1" : "flex min-w-0 items-center gap-1"}
        >
          {index > 0 && <TriangleRightMini className="shrink-0 rtl:rotate-180" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-ui-fg-base transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="truncate text-ui-fg-base" title={item.label} aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export default Breadcrumb
