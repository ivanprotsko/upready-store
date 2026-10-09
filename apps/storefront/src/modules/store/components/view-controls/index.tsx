"use client"

import { useRouter } from "next/navigation"
import { useTransition, type ReactNode } from "react"
import { useTranslations } from "next-intl"

import { CATALOG_VIEW_COOKIE, CATALOG_VIEWS, type CatalogView } from "@lib/util/catalog-view"

const YEAR = 60 * 60 * 24 * 365

/** Each view's name in the `Store` section. */
const VIEW_KEY = { grid: "viewGrid", list: "viewList", compact: "viewCompact" } as const satisfies Record<CatalogView, string>

const ICONS: Record<CatalogView, ReactNode> = {
  grid: (
    <path d="M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z" />
  ),
  list: (
    <path d="M3 4h4v4H3zM9 5h8v2H9zM3 12h4v4H3zM9 13h8v2H9z" />
  ),
  compact: (
    <path d="M3 3h4v4H3zM8 3h4v4H8zM13 3h4v4h-4zM3 8h4v4H3zM8 8h4v4H8zM13 8h4v4h-4zM3 13h4v4H3zM8 13h4v4H8zM13 13h4v4h-4z" />
  ),
}

/**
 * The listing's own control, above the products: how they are drawn (grid, rows, a denser
 * grid). The choice goes to a cookie (`@lib/util/catalog-view`) and the page is asked for
 * again, and the list starts over in the new view. There is no page size to pick: a product
 * list has no pages (rule 5zg).
 */
export default function ViewControls({ view }: { view: CatalogView }) {
  const t = useTranslations("Store")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const apply = (value: CatalogView) => {
    document.cookie = `${CATALOG_VIEW_COOKIE}=${value}; path=/; max-age=${YEAR}; samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div
      className="mb-4 flex items-center justify-end gap-x-3"
      data-testid="catalog-view-controls"
      aria-busy={pending}
    >
      <div
        role="group"
        aria-label={t("view")}
        className="inline-flex overflow-hidden rounded-[var(--radius,8px)] border border-ui-border-base"
      >
        {CATALOG_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            title={t(VIEW_KEY[option])}
            aria-label={t(VIEW_KEY[option])}
            aria-pressed={option === view}
            onClick={() => apply(option)}
            className={
              option === view
                ? "flex size-9 items-center justify-center bg-ui-bg-subtle-hover text-ui-fg-base"
                : "flex size-9 items-center justify-center bg-ui-bg-base text-ui-fg-muted hover:text-ui-fg-base"
            }
            data-testid={`catalog-view-${option}`}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden>
              {ICONS[option]}
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
