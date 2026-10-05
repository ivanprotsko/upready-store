import { Fragment, type ReactNode } from "react"
import type { HttpTypes } from "@medusajs/types"
import { Link } from "@i18n/navigation"
import { clx } from "@medusajs/ui"

import SubcategoryFilter from "./subcategory-filter"

type CategorySidebarProps = {
  categories: HttpTypes.StoreProductCategory[]
  activeCategoryId?: string
}

const CategorySidebar = ({
  categories,
  activeCategoryId,
}: CategorySidebarProps) => {
  const topLevel = categories.filter((c) => !c.parent_category_id)
  const activeCategory = categories.find((c) => c.id === activeCategoryId)
  const childCategories = activeCategory?.category_children ?? []

  // The branch the buyer is in, from the open category up to its root. Its levels are drawn
  // open under the root, so a second or third level shows where it sits (ask a0e1); every
  // other root stays one line, as before.
  const byId = new Map(categories.map((c) => [c.id, c]))
  const branch = new Set<string>()
  for (let c = activeCategory; c && !branch.has(c.id); c = c.parent_category_id ? byId.get(c.parent_category_id) : undefined) {
    branch.add(c.id)
  }

  const INDENT = ["px-2", "ps-5 pe-2", "ps-8 pe-2"]

  const level = (items: HttpTypes.StoreProductCategory[], depth: number): ReactNode =>
    items.map((item) => {
      const children = (byId.get(item.id) ?? item).category_children ?? []
      // The open category's own children are the checkboxes above, not a second list here.
      const open = branch.has(item.id) && item.id !== activeCategoryId && depth < INDENT.length - 1

      return (
        <Fragment key={item.id}>
          <Link
            href={`/categories/${item.handle}`}
            className={clx(
              "txt-compact-small text-ui-fg-base hover:text-ui-fg-base hover:bg-ui-bg-subtle rounded-md transition-colors w-full py-1",
              INDENT[depth],
              {
                "text-ui-fg-base font-medium bg-ui-bg-base-hover": item.id === activeCategoryId,
              }
            )}
          >
            {item.name}
          </Link>
          {open && children.length ? level(children, depth + 1) : null}
        </Fragment>
      )
    })

  return (
    <div className="hidden flex-col lg:flex gap-5">
      <SubcategoryFilter
        subcategories={childCategories.map((c) => ({
          id: c.id,
          name: c.name,
          handle: c.handle,
        }))}
      />
      <div className="flex flex-col gap-1">
        {level(topLevel, 0)}
      </div>
    </div>
  )
}

export default CategorySidebar
