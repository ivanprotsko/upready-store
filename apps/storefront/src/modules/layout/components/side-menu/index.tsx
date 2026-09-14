"use client"

import { Popover, PopoverPanel, Transition, PopoverButton } from "@headlessui/react"
import useScrollLock from "@lib/hooks/use-scroll-lock"
import { BarsThree, XMark } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import { Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { Fragment } from "react"

const ScrollLock = ({ enabled }: { enabled: boolean }) => {
  useScrollLock(enabled)
  return null
}

const sideMenuItems = [
  { key: "home" as const, href: "/" },
  { key: "store" as const, href: "/store" },
  { key: "account" as const, href: "/account" },
  { key: "cart" as const, href: "/cart" },
]

/**
 * `siteName` comes from the server parent (the tenant's `x-tenant-name`
 * header, single-store `SITE_NAME` fallback) as a PROP: this is a client
 * component, so it must never import the `next/headers`-reading accessor
 * directly (rule 19g — a `"use client"` directive colours the whole import
 * graph below it).
 */
const SideMenu = ({ siteName }: { siteName: string }) => {
  const t = useTranslations()

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <ScrollLock enabled={open} />
              <div className="relative flex h-full">
                <PopoverButton
                  aria-label={t("SideMenu.menuButton")}
                  data-testid="nav-menu-button"
                  className="relative h-full flex gap-1 items-center transition-all ease-out duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] hover:text-ui-fg-base txt-compact-xsmall"
                >
                  <BarsThree />
                </PopoverButton>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-ui-bg-overlay/0 pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0"
                enterTo="opacity-100 backdrop-blur-2xl"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 backdrop-blur-2xl"
                leaveTo="opacity-0"
              >
                {/*
                  The panel is a SURFACE, not a scrim: it has to cover the page
                  behind it. --bg-overlay is semi-transparent (0.4 light, 0.72
                  dark), so painting the panel with it left the page showing
                  through and the links at 2.53:1 light / 1.08:1 dark (d-14).
                  An opaque --bg-base carries --fg-base, the one pair every
                  preset's palette gate proves.
                */}
                <PopoverPanel className="flex flex-col fixed inset-0 sm:end-auto sm:w-1/3 2xl:w-1/4 sm:min-w-min z-[51] text-sm text-ui-fg-base m-2 rounded-rounded">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full bg-ui-bg-base border border-ui-border-base shadow-elevation-flyout rounded-rounded justify-between p-6"
                  >
                    <div className="flex justify-end" id="xmark">
                      <button
                        data-testid="close-menu-button"
                        aria-label={t("Common.close")}
                        onClick={close}
                        className="rounded-rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
                      >
                        <XMark />
                      </button>
                    </div>
                    <ul className="flex flex-col gap-6 items-start justify-start">
                      {sideMenuItems.map(({ key, href }) => (
                        <li key={key}>
                          <Link
                            href={href}
                            className="text-3xl leading-10 hover:text-ui-fg-interactive"
                            onClick={close}
                            data-testid={`${key}-link`}
                          >
                            {t(`SideMenu.items.${key}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-y-6">
                      <Text className="flex justify-between txt-compact-small">
                        {t("SideMenu.copyright", {
                          year: new Date().getFullYear(),
                          siteName,
                        })}
                      </Text>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
