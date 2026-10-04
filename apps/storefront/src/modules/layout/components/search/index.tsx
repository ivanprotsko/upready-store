"use client"

import { MagnifyingGlass } from "@medusajs/icons"
import { useTranslations } from "next-intl"

import { openSearch } from "./store"

/**
 * A search control, the magnifier that opens the page's one search palette, the same one
 * Cmd+K / Ctrl+K opens (`./palette`, placed once by the `(main)` layout). A page may draw it in
 * several places, and every one of them opens that palette.
 */
const Search = ({
  className = "text-ui-fg-subtle hover:text-ui-fg-base transition-colors",
}: {
  className?: string
}) => {
  const t = useTranslations("Search")

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label={t("label")}
      aria-haspopup="dialog"
      className={className}
      data-testid="search-button"
    >
      <MagnifyingGlass />
    </button>
  )
}

export default Search
