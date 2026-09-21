import { clx } from "@medusajs/ui"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { findTabs } from "./nav-model"

/**
 * The tab row of a section that spans several screens («Площадки», «Акции»,
 * «Доставка», «Оплата», «Поиск и счётчики»). On a narrow screen the row scrolls
 * inside itself, so the page never scrolls sideways.
 */
export const SectionTabs = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const section = findTabs(pathname)
  const row = useRef<HTMLElement>(null)
  const current = section?.current ?? null

  // On a phone the row is wider than the screen: bring the open tab into view,
  // so she sees where she is without scrolling the row herself.
  useEffect(() => {
    row.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [current])

  if (!section) {
    return null
  }

  return (
    <nav
      ref={row}
      aria-label={t("app.nav.owner.tabs.label")}
      className="border-ui-border-base -mx-3 -mt-3 mb-1 overflow-x-auto border-b px-3"
    >
      <ul className="flex w-max gap-x-1">
        {section.tabs.map((tab) => {
          const current = tab.to === section.current
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={current ? "page" : undefined}
                className={clx(
                  "txt-compact-small-plus transition-fg flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 outline-none focus-visible:shadow-borders-focus",
                  current
                    ? "border-ui-fg-base text-ui-fg-base"
                    : "text-ui-fg-subtle hover:text-ui-fg-base border-transparent"
                )}
              >
                {t(tab.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
