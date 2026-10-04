"use client"

import { MagnifyingGlass, XMarkMini, MagnifierAlert } from "@medusajs/icons"
import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react"
import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"
import { searchProducts } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import ProductMedia from "@modules/products/components/product-media"

import { closeSearch, isSearchShortcut, toggleSearch, useSearchOpen } from "./store"

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const highlightMatch = (text: string, query: string) => {
  const trimmed = query.trim()
  if (!trimmed) return text

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"))

  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-ui-bg-highlight text-ui-fg-interactive"
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

// BRANCH-LOCAL (`redesign-olavka`, Ivan's remark 18): in an Olavka shop the field the overlay
// opens on shows no focus ring. The open overlay is itself the sign of where typing goes, and
// the caret stays in the field. By the `data-shop` mark on `<html>`, because the dialog is a
// portal outside the page. Every other shop keeps the ring until Ivan decides for them.
const QUIET_INPUT_FOCUS = "[[data-shop=olavka]_&]:focus-visible:ring-0"

/**
 * The search palette, rendered once by the `(main)` layout. Cmd+K / Ctrl+K and every `Search`
 * control open this one dialog through `./store`.
 */
const SearchPalette = () => {
  const t = useTranslations("Search")
  const tc = useTranslations("Common")
  const locale = useLocale()
  const router = useRouter()

  const open = useSearchOpen()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HttpTypes.StoreProduct[]>([])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isSearchShortcut(e)) {
        e.preventDefault()
        toggleSearch()
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    if (!open) return

    const trimmed = query.trim()
    setLoading(true)
    const id = setTimeout(
      () => {
        searchProducts(trimmed)
          .then((products) => setResults(products))
          .catch(() => setResults([]))
          .finally(() => setLoading(false))
      },
      trimmed ? 300 : 0
    )

    return () => clearTimeout(id)
  }, [query, open])

  const close = useCallback(() => {
    closeSearch()
    setQuery("")
    setResults([])
  }, [])

  const handleSelect = useCallback(
    (handle?: string | null) => {
      if (!handle) return
      close()
      router.push(`/products/${handle}`)
    },
    [close, router]
  )

  const trimmed = query.trim()

  return (
    <Dialog open={open} onClose={close} className="relative z-[100]">
      <DialogBackdrop className="fixed inset-0 bg-ui-bg-overlay" />
      <div className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh]">
        <DialogPanel className="w-full max-w-xl overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-lg">
          <div className="flex items-center gap-2 border-b border-ui-border-base px-4">
            <MagnifyingGlass className="shrink-0 text-ui-fg-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("placeholder")}
              className={`h-12 w-full bg-transparent txt-compact-medium text-base text-ui-fg-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] placeholder:text-ui-fg-muted ${QUIET_INPUT_FOCUS}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={tc("clear")}
                className="shrink-0 text-ui-fg-muted hover:text-ui-fg-base"
              >
                <XMarkMini />
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-1">
            {loading && (
              <p className="px-4 py-6 text-center txt-compact-small text-ui-fg-muted">
                {t("loading")}
              </p>
            )}

            {!loading && !trimmed && results.length > 0 && (
              <p className="px-4 pb-2 pt-3 txt-compact-xsmall-plus uppercase tracking-wider">
                {t("popular")}
              </p>
            )}

            {!loading && trimmed && results.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-8 py-10 text-center">
                <MagnifierAlert className="text-ui-fg-muted" />
                <p className="txt-compact-small text-ui-fg-subtle">
                  {t("empty", { query: trimmed })}
                </p>
              </div>
            )}

            {!loading &&
              results.map((product) => {
                const { cheapestPrice } = getProductPrice({ product, locale })
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => handleSelect(product.handle)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-ui-bg-base-hover"
                  >
                    <ProductMedia
                      src={product.thumbnail}
                      alt={product.title ?? ""}
                      context="line"
                      sizes="40px"
                      className="w-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate txt-compact-small text-ui-fg-base">
                      {highlightMatch(product.title ?? "", trimmed)}
                    </span>
                    {cheapestPrice && (
                      <span className="shrink-0 txt-compact-small text-ui-fg-subtle">
                        {cheapestPrice.calculated_price}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export default SearchPalette
