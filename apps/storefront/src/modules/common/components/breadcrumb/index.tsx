import { TriangleRightMini } from "@medusajs/icons"
import { Link } from "@i18n/navigation"

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
}

const Breadcrumb = ({ items }: BreadcrumbProps) => {
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
