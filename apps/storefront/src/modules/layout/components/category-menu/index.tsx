"use client"

import type React from "react"

import {
  BarsThree,
  XMark,
  ChevronRightMini,
  ChevronLeftMini,
} from "@medusajs/icons"
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion"
import { Checkbox } from "@medusajs/ui"
import { Link } from "@i18n/navigation"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import type { HttpTypes } from "@medusajs/types"
import useScrollLock from "@lib/hooks/use-scroll-lock"
import {
  SUBCATEGORY_QUERY_KEY,
  parseSubcategoryHandles,
} from "@lib/util/subcategory-filters"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"

type CategoryMenuProps = {
  categories: HttpTypes.StoreProductCategory[]
  className?: string
  /**
   * Shop-wide controls shown under the category list: on a phone the header has no room
   * for language, country and theme, so this menu is where a visitor finds them.
   */
  settings?: React.ReactNode
}

type Direction = "forward" | "backward"

/**
 * `x` offsets are physical, so the drill-in/drill-out slide has to be inverted
 * for RTL locales: "forward" travels leftwards there.
 */
type SlideCustom = { nav: Direction; rtl: boolean }

const slidesLeft = ({ nav, rtl }: SlideCustom) => (nav === "forward") !== rtl

const slideVariants = {
  enter: (custom: SlideCustom) => ({
    x: slidesLeft(custom) ? "60%" : "-60%",
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (custom: SlideCustom) => ({
    x: slidesLeft(custom) ? "-60%" : "60%",
    opacity: 0,
  }),
}

const CategoryMenu = ({ categories, className, settings }: CategoryMenuProps) => {
  const t = useTranslations("CategoryMenu")
  const tc = useTranslations("Common")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction>("forward")
  const isRtl = useLocaleDirection() === "rtl"
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set())

  useEffect(() => setMounted(true), [])

  useScrollLock(isOpen)

  const topLevel = categories.filter((c) => !c.parent_category_id)
  const activeCategory = categories.find((c) => c.id === activeId) ?? null

  const close = () => {
    setIsOpen(false)
    setActiveId(null)
  }

  const goForward = (category: HttpTypes.StoreProductCategory) => {
    setDirection("forward")
    const onThisCategory = pathname.includes(`/categories/${category.handle}`)
    setSelectedSubs(
      new Set(onThisCategory ? parseSubcategoryHandles(searchParams) : [])
    )
    setActiveId(category.id)
  }

  // One level up: from a third level back to the second, from the second to the top.
  const goBack = () => {
    setDirection("backward")
    setActiveId(activeCategory?.parent_category_id ?? null)
  }

  /** The children of a child, which a child entry of the list does not carry itself. */
  const withChildren = (id: string) => {
    const category = categories.find((c) => c.id === id)
    return category?.category_children?.length ? category : null
  }

  const toggleSub = (
    category: HttpTypes.StoreProductCategory,
    subHandle: string,
    checked: boolean
  ) => {
    const next = new Set(selectedSubs)
    if (checked) {
      next.add(subHandle)
    } else {
      next.delete(subHandle)
    }
    setSelectedSubs(next)

    const params = new URLSearchParams()
    next.forEach((handle) => params.append(SUBCATEGORY_QUERY_KEY, handle))
    const queryString = params.toString()
    router.push(
      `/categories/${category.handle}${queryString ? `?${queryString}` : ""}`
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t("title")}
        className={className}
      >
        <BarsThree />
      </button>

      {mounted &&
        createPortal(
          <LazyMotion features={domAnimation} strict>
            <AnimatePresence>
              {isOpen && (
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[70] flex flex-col bg-ui-bg-base p-10"
                >
                  <div className="flex h-8 items-center justify-between">
                    {activeCategory ? (
                      <button
                        type="button"
                        onClick={goBack}
                        className="flex items-center gap-1 text-ui-fg-subtle transition-colors hover:text-ui-fg-base"
                      >
                        <ChevronLeftMini className="rtl:rotate-180" />
                        {activeCategory.name}
                      </button>
                    ) : (
                      <span className="text-ui-fg-subtle">{t("title")}</span>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      aria-label={tc("close")}
                      className="text-ui-fg-subtle transition-colors hover:text-ui-fg-base"
                    >
                      <XMark />
                    </button>
                  </div>

                  <div className="relative flex-1 overflow-hidden">
                    <AnimatePresence custom={{ nav: direction, rtl: isRtl }} initial={false}>
                      {!activeCategory ? (
                        <m.div
                          key="root"
                          custom={{ nav: direction, rtl: isRtl }}
                          variants={slideVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                          className="absolute inset-0 flex items-center"
                        >
                          <ul className="flex flex-col items-start gap-4">
                            {topLevel.map((category) =>
                              category.category_children?.length ? (
                                <li key={category.id}>
                                  <button
                                    type="button"
                                    onClick={() => goForward(category)}
                                    className="flex items-center gap-1 text-2xl text-ui-fg-base transition-colors hover:text-ui-fg-subtle"
                                  >
                                    {category.name}
                                    <ChevronRightMini className="rtl:rotate-180" />
                                  </button>
                                </li>
                              ) : (
                                <li key={category.id}>
                                  <Link
                                    href={`/categories/${category.handle}`}
                                    onClick={close}
                                    className="text-2xl text-ui-fg-base transition-colors hover:text-ui-fg-subtle"
                                  >
                                    {category.name}
                                  </Link>
                                </li>
                              )
                            )}
                          </ul>
                        </m.div>
                      ) : (
                        <m.div
                          key={activeCategory.id}
                          custom={{ nav: direction, rtl: isRtl }}
                          variants={slideVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                          className="absolute inset-0 flex items-center"
                        >
                          <ul className="flex flex-col items-start gap-4">
                            <li>
                              <Link
                                href={`/categories/${activeCategory.handle}`}
                                onClick={close}
                                className="text-2xl text-ui-fg-base transition-colors hover:text-ui-fg-subtle"
                              >
                                {t("viewAll")}
                              </Link>
                            </li>
                            {activeCategory.category_children.map((sub) => (
                              <li
                                key={sub.id}
                                // A row grows the step deeper only when the child has children
                                // of its own; a shop of two levels keeps its plain rows.
                                className={withChildren(sub.id) ? "flex items-center gap-2" : undefined}
                              >
                                <label
                                  htmlFor={`cat-${sub.id}`}
                                  className="flex cursor-pointer items-center gap-3 text-2xl text-ui-fg-base"
                                >
                                  <Checkbox
                                    id={`cat-${sub.id}`}
                                    checked={selectedSubs.has(sub.handle)}
                                    onCheckedChange={(checked) =>
                                      toggleSub(
                                        activeCategory,
                                        sub.handle,
                                        checked === true
                                      )
                                    }
                                  />
                                  {sub.name}
                                </label>
                                {withChildren(sub.id) ? (
                                  <button
                                    type="button"
                                    aria-label={sub.name}
                                    onClick={() => goForward(withChildren(sub.id) as HttpTypes.StoreProductCategory)}
                                    className="flex items-center text-ui-fg-subtle transition-colors hover:text-ui-fg-base"
                                    data-testid="category-menu-deeper"
                                  >
                                    <ChevronRightMini className="rtl:rotate-180" />
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {settings ? (
                    <div
                      className="flex items-center justify-between gap-x-4 border-t border-ui-border-base pt-4"
                      data-testid="category-menu-settings"
                    >
                      {settings}
                    </div>
                  ) : null}
                </m.div>
              )}
            </AnimatePresence>
          </LazyMotion>,
          document.body
        )}
    </>
  )
}

export default CategoryMenu
