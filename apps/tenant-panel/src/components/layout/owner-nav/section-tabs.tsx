import { clx } from "@medusajs/ui"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { usePermissions } from "../../../hooks/use-permissions"
import { visibleTabs } from "../../../lib/permissions"
import { findTabs } from "./nav-model"

/**
 * The tab row of a section that spans several screens («Акции», «Доставка»,
 * «Оплата», «Поиск и счётчики»; the marketplaces have their screens in the
 * sidebar instead). On a narrow screen the row scrolls inside itself, so the
 * page never scrolls sideways.
 */
export const SectionTabs = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { permissions, allowed } = usePermissions()
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

  // t-2026-10-07-11: only the tabs the login may open, and no row at all over
  // «Нет доступа».
  const tabs = section && allowed(pathname) ? visibleTabs(section.tabs, permissions) : []

  if (!section || !tabs.length) {
    return null
  }

  return (
    <nav
      ref={row}
      aria-label={t("app.nav.owner.tabs.label")}
      className="border-ui-border-base -mx-3 -mt-3 mb-1 overflow-x-auto border-b px-3"
    >
      <ul className="flex w-max gap-x-1">
        {tabs.map((tab) => {
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
