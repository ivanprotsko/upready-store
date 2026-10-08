import { getLocale } from "next-intl/server"

import { listCategories } from "@lib/data/categories"

import OlavkaCategoryRailClient from "./rail"
import { railItems } from "./rail-items"

/**
 * The category row under the Olavka header (t-2026-10-09-41, Ivan's ask 4c05): the second row
 * of his frame CatalogNav in the look, chrxnasdmds' `CategoryRail` in the behaviour. The
 * shop's own categories, read through the same tenant-scoped `listCategories()` the footer
 * and the menus use (one cached fetch per request), so a category the owner adds in her panel
 * appears here with the next tint and nothing names a category in code.
 */
export default async function OlavkaCategoryRail() {
  const [categories, locale] = await Promise.all([listCategories(), getLocale()])
  const items = railItems(categories, locale)

  if (!items.length) {
    return null
  }

  return <OlavkaCategoryRailClient items={items} />
}
