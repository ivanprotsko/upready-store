import { ArrowUpRightOnBox, SidebarLeft, TriangleRightMini, XMark } from "@medusajs/icons"
import { IconButton, clx } from "@medusajs/ui"
import { AnimatePresence } from "motion/react"
import { Dialog as RadixDialog } from "radix-ui"
import { PropsWithChildren, ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Link,
  UIMatch,
  useLocation,
  useMatches,
  useNavigation,
} from "react-router-dom"

import { DocumentFavicon } from "../../../hooks/use-document-favicon"
import { DocumentTitle } from "../../../hooks/use-document-title"
import { useShopUrl } from "../../../hooks/use-shop-url"
import { CommandMenuProvider } from "../../../providers/command-menu-provider"
import { KeybindProvider } from "../../../providers/keybind-provider"
import { useGlobalShortcuts } from "../../../providers/keybind-provider/hooks"
import { usePermissions } from "../../../hooks/use-permissions"
import { useSidebar } from "../../../providers/sidebar-provider"
import { PermissionOutlet } from "../../authentication/permission-outlet"
import { CommandMenuTopbarButton } from "../../command-menu"
import { ProgressBar } from "../../common/progress-bar"
import { SectionTabs, findActive } from "../owner-nav"

// tenant-panel: drops the Admin's `LayoutCustomizerHostProvider`,
// `LayoutCustomizerSlot`, `CustomizerMenu`, `Notifications` and the topbar's
// widget `LayoutComposer` zone. All of it exists to let a user customize or
// be notified through extension-registered widgets (the "customize layout"
// trigger, the notifications bell); the panel has no extensions and no
// `/tenants/notifications` route, so the topbar's right side is empty
// instead of hosting dead controls. `KeybindProvider` stays: `UserMenu` and
// `NavItem` still read `useGlobalShortcuts()` for the shortcuts modal and
// per-item tooltips. The Admin's `SearchProvider` (⌘K) comes back as
// `CommandMenuProvider` (ask-20261005-112844-10ba), which lists the owner's
// screens, actions, products and orders instead of `/admin/search`.

export const Shell = ({ children }: PropsWithChildren) => {
  const globalShortcuts = useGlobalShortcuts()
  const navigation = useNavigation()

  const loading = navigation.state === "loading"

  return (
    <KeybindProvider shortcuts={globalShortcuts}>
      <CommandMenuProvider>
        <DocumentTitle />
        <DocumentFavicon />
        <div className="relative flex h-screen flex-col items-start overflow-hidden lg:flex-row">
          <NavigationBar loading={loading} />
          <div>
            <MobileSidebarContainer>{children}</MobileSidebarContainer>
            <DesktopSidebarContainer>{children}</DesktopSidebarContainer>
          </div>
          <div className="flex h-screen w-full flex-col overflow-auto">
            <Topbar />
            <main
              className={clx(
                "flex h-full w-full flex-col items-center overflow-y-auto transition-opacity delay-200 duration-200",
                {
                  "opacity-25": loading,
                }
              )}
            >
              <Gutter>
                <SectionTabs />
                {/* t-2026-10-07-11: «Нет доступа» instead of a screen the
                    login's role does not open. */}
                <PermissionOutlet />
              </Gutter>
            </main>
          </div>
        </div>
      </CommandMenuProvider>
    </KeybindProvider>
  )
}

const NavigationBar = ({ loading }: { loading: boolean }) => {
  const [showBar, setShowBar] = useState(false)

  /**
   * If the loading state is true, we want to show the bar after a short delay.
   * The delay is used to prevent the bar from flashing on quick navigations.
   */
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    if (loading) {
      timeout = setTimeout(() => {
        setShowBar(true)
      }, 200)
    } else {
      setShowBar(false)
    }

    return () => {
      clearTimeout(timeout)
    }
  }, [loading])

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1">
      <AnimatePresence>{showBar ? <ProgressBar /> : null}</AnimatePresence>
    </div>
  )
}

const Gutter = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex w-full max-w-[1600px] flex-col gap-y-2 p-3">
      {children}
    </div>
  )
}

const Breadcrumbs = () => {
  const { pathname } = useLocation()
  const { allowed } = usePermissions()
  const matches = useMatches() as unknown as UIMatch<
    unknown,
    {
      breadcrumb?: (match?: UIMatch) => string | ReactNode
    }
  >[]

  // t-2026-10-07-11: a crumb of a detail screen reads its record from the
  // server («Заказ #1024»), so a closed address draws no crumbs at all.
  if (!allowed(pathname)) {
    return null
  }

  const crumbs = matches
    .filter((match) => match.handle?.breadcrumb)
    .map((match) => {
      const handle = match.handle

      let label: string | ReactNode | undefined = undefined

      try {
        label = handle.breadcrumb?.(match)
      } catch (error) {
        // noop
      }

      if (!label) {
        return null
      }

      return {
        label: label,
        path: match.pathname,
      }
    })
    .filter(Boolean) as { label: string | ReactNode; path: string }[]

  return (
    <ol
      className={clx(
        "text-ui-fg-muted txt-compact-small-plus flex select-none items-center"
      )}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        const isSingle = crumbs.length === 1

        return (
          <li key={index} className={clx("flex items-center")}>
            {!isLast ? (
              <Link
                className="transition-fg hover:text-ui-fg-subtle"
                to={crumb.path}
              >
                {crumb.label}
              </Link>
            ) : (
              <div>
                {!isSingle && <span className="block lg:hidden">...</span>}
                <span
                  key={index}
                  className={clx({
                    "hidden lg:block": !isSingle,
                  })}
                >
                  {crumb.label}
                </span>
              </div>
            )}
            {!isLast && (
              <span className="mx-2">
                <TriangleRightMini className="rtl:rotate-180" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const ToggleSidebar = () => {
  const { t } = useTranslation()
  const { toggle } = useSidebar()

  return (
    <div>
      <IconButton
        className="hidden lg:flex"
        variant="transparent"
        onClick={() => toggle("desktop")}
        size="small"
      >
        <SidebarLeft className="text-ui-fg-muted rtl:rotate-180" />
      </IconButton>
      <IconButton
        className="hidden max-lg:flex max-lg:h-11 max-lg:w-11"
        variant="transparent"
        onClick={() => toggle("mobile")}
        size="small"
        aria-label={t("app.nav.owner.openMenu")}
      >
        <SidebarLeft className="text-ui-fg-muted rtl:rotate-180" />
      </IconButton>
    </div>
  )
}

/**
 * o21-owner-panel-ux: the shop is one tap away from every screen. The address
 * is built the way the overview builds it (primary host plus default locale);
 * while it is unknown the button is simply absent.
 */
const OpenShop = () => {
  const { t } = useTranslation()
  const href = useShopUrl()

  if (!href) {
    return null
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid="topbar-open-shop"
      className="txt-compact-small-plus text-ui-fg-base shadow-buttons-neutral bg-ui-button-neutral hover:bg-ui-button-neutral-hover transition-fg flex min-h-8 shrink-0 items-center gap-x-1.5 rounded-md px-2.5 outline-none max-lg:min-h-11 focus-visible:shadow-borders-focus"
    >
      <span className="max-sm:hidden">{t("app.nav.owner.openShop")}</span>
      <span className="sm:hidden">{t("app.nav.owner.openShopShort")}</span>
      <ArrowUpRightOnBox />
    </a>
  )
}

/**
 * The name of the open screen, from the menu entry it belongs to. On a phone
 * it replaces the breadcrumb, which collapsed to «…» or to nothing there.
 */
const ScreenTitle = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const active = findActive(pathname)

  if (!active) {
    return null
  }
  return (
    <span
      data-testid="topbar-title"
      className="txt-compact-medium-plus text-ui-fg-base min-w-0 truncate lg:hidden"
    >
      {t(active.item.labelKey)}
    </span>
  )
}

const Topbar = () => {
  return (
    <div className="flex w-full items-center justify-between gap-x-3 border-b p-3">
      <div className="flex min-w-0 items-center gap-x-1.5">
        <ToggleSidebar />
        <ScreenTitle />
        <div className="max-lg:hidden">
          <Breadcrumbs />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-x-1.5">
        <CommandMenuTopbarButton />
        <OpenShop />
      </div>
    </div>
  )
}

const DesktopSidebarContainer = ({ children }: PropsWithChildren) => {
  const { desktop } = useSidebar()

  return (
    <div
      className={clx("hidden h-screen w-[220px] border-e", {
        "lg:flex": desktop,
      })}
    >
      {children}
    </div>
  )
}

const MobileSidebarContainer = ({ children }: PropsWithChildren) => {
  const { t } = useTranslation()
  const { mobile, toggle } = useSidebar()

  return (
    <RadixDialog.Root open={mobile} onOpenChange={() => toggle("mobile")}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={clx(
            "bg-ui-bg-overlay fixed inset-0",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <RadixDialog.Content
          className={clx(
            "bg-ui-bg-subtle shadow-elevation-modal fixed inset-y-2 start-2 flex w-full max-w-[304px] flex-col overflow-hidden rounded-lg border-r",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-start-1/2 data-[state=open]:slide-in-from-start-1/2 duration-200"
          )}
        >
          <div className="p-3">
            <RadixDialog.Close asChild>
              <IconButton
                size="small"
                variant="transparent"
                className="text-ui-fg-subtle"
              >
                <XMark />
              </IconButton>
            </RadixDialog.Close>
            <RadixDialog.Title className="sr-only">
              {t("app.nav.accessibility.title")}
            </RadixDialog.Title>
            <RadixDialog.Description className="sr-only">
              {t("app.nav.accessibility.description")}
            </RadixDialog.Description>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
