"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition, type ReactNode } from "react"
import { useTranslations } from "next-intl"

import {
  CATALOG_PER_PAGE_COOKIE,
  CATALOG_PER_PAGE_OPTIONS,
  CATALOG_VIEW_COOKIE,
  CATALOG_VIEWS,
  type CatalogView,
} from "@lib/util/catalog-view"

const YEAR = 60 * 60 * 24 * 365

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
 * The listing's own controls, above the products: how they are drawn (grid, rows, a denser
 * grid) and how many a page holds. The choice goes to two cookies (`@lib/util/catalog-view`)
 * and the page is asked for again; a new page size also drops `page` from the address,
 * because page 5 of twelve is not page 5 of forty-eight.
 */
export default function ViewControls({ view, perPage }: { view: CatalogView; perPage: number }) {
  const t = useTranslations("CatalogView")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const apply = (cookie: string, value: string) => {
    document.cookie = `${cookie}=${value}; path=/; max-age=${YEAR}; samesite=lax`

    startTransition(() => {
      if (!searchParams.has("page")) {
        router.refresh()
        return
      }

      const params = new URLSearchParams(searchParams.toString())
      params.delete("page")
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div
      className="mb-4 flex items-center justify-end gap-x-3"
      data-testid="catalog-view-controls"
      aria-busy={pending}
    >
      <div
        role="group"
        aria-label={t("label")}
        className="inline-flex overflow-hidden rounded-[var(--radius,8px)] border border-ui-border-base"
      >
        {CATALOG_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            title={t(option)}
            aria-label={t(option)}
            aria-pressed={option === view}
            onClick={() => apply(CATALOG_VIEW_COOKIE, option)}
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
      <select
        aria-label={t("perPage")}
        title={t("perPage")}
        value={perPage}
        onChange={(event) => apply(CATALOG_PER_PAGE_COOKIE, event.target.value)}
        className="h-9 rounded-[var(--radius,8px)] border border-ui-border-base bg-ui-bg-base px-2 text-sm tabular-nums text-ui-fg-base"
        data-testid="catalog-per-page"
      >
        {CATALOG_PER_PAGE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  )
}
