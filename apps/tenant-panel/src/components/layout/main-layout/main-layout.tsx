import {
  ChartBar,
  ChatBubbleLeftRight,
  DocumentText,
  EllipsisHorizontal,
  Folder,
  House,
  RocketLaunch,
  OpenRectArrowOut,
  ReceiptPercent,
  ShoppingCart,
  Tag,
} from "@medusajs/icons"
import { Avatar, clx, Divider, DropdownMenu, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useStore } from "../../../hooks/api/store"
import { Skeleton } from "../../common/skeleton"
import { INavItem, NavItem } from "../../layout/nav-item"
import { Shell } from "../../layout/shell"

import { useNavigate } from "react-router-dom"
import { useLogout } from "../../../hooks/api"
import { queryClient } from "../../../lib/query-client"
import { UserMenu } from "../user-menu"
import { useDocumentDirection } from "../../../hooks/use-document-direction"

// tenant-panel: rewritten from the Admin's main-layout.tsx, kept as a single
// file (same shape as upstream: MainLayout/MainSidebar/Header/SidebarRoutes/
// UserSection co-located) so the diff against the upstream file stays a
// single, reviewable unit rather than a set of new file boundaries. The
// Admin's `MainSidebar` renders a wide, extension-aware nav (products,
// orders, inventory, customers, promotions, price lists, plus whatever
// extensions register, all reorderable through `LayoutComposer`) behind a
// `PermissionGuard`, a search trigger and a settings section. The panel has
// exactly three screens and no RBAC, no search and no settings route, so this
// keeps only: the store name block at the top (unchanged, `useStore()`), a
// flat three-item sidebar (Overview, Products, Orders, the Admin's own icons
// for the latter two), and the user menu at the bottom (unchanged, `useMe`/
// `useLogout` via `UserMenu`).
export const MainLayout = () => {
  return (
    <Shell>
      <MainSidebar />
    </Shell>
  )
}

const MainSidebar = () => {
  return (
    <aside className="flex flex-1 flex-col justify-between overflow-y-auto">
      <div className="flex flex-1 flex-col">
        <div className="bg-ui-bg-subtle sticky top-0">
          <Header />
          <div className="px-3">
            <Divider variant="dashed" />
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <SidebarRoutes />
        </div>
        <div className="bg-ui-bg-subtle sticky bottom-0">
          <UserSection />
        </div>
      </div>
    </aside>
  )
}

const Logout = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { mutateAsync: logoutMutation } = useLogout()

  const handleLogout = async () => {
    await logoutMutation(undefined, {
      onSuccess: () => {
        /**
         * When the user logs out, we want to clear the query cache
         */
        queryClient.clear()
        navigate("/login")
      },
    })
  }

  return (
    <DropdownMenu.Item onClick={handleLogout}>
      <div className="flex items-center gap-x-2">
        <OpenRectArrowOut className="text-ui-fg-subtle" />
        <span>{t("app.menus.actions.logout")}</span>
      </div>
    </DropdownMenu.Item>
  )
}

const Header = () => {
  // tenant-panel: verbatim Admin behaviour; `GET /tenants/store` exists since
  // the backend piece of this task, so a failure here is a real one.
  const { store, isPending, isError, error } = useStore()
  const direction = useDocumentDirection()
  const name = store?.name
  const fallback = store?.name?.slice(0, 1).toUpperCase()

  const isLoaded = !isPending && !!store && !!name && !!fallback

  if (isError) {
    throw error
  }

  return (
    <div className="w-full p-3">
      <DropdownMenu dir={direction}>
        <DropdownMenu.Trigger
          disabled={!isLoaded}
          className={clx(
            "bg-ui-bg-subtle transition-fg grid w-full grid-cols-[24px_1fr_15px] items-center gap-x-3 rounded-md p-0.5 pe-2 outline-none",
            "hover:bg-ui-bg-subtle-hover",
            "data-[state=open]:bg-ui-bg-subtle-hover",
            "focus-visible:shadow-borders-focus"
          )}
        >
          {fallback ? (
            <Avatar variant="squared" size="xsmall" fallback={fallback} />
          ) : (
            <Skeleton className="h-6 w-6 rounded-md" />
          )}
          <div className="block overflow-hidden text-start">
            {name ? (
              <Text
                size="small"
                weight="plus"
                leading="compact"
                className="truncate"
              >
                {store.name}
              </Text>
            ) : (
              <Skeleton className="h-[9px] w-[120px]" />
            )}
          </div>
          <EllipsisHorizontal className="text-ui-fg-muted" />
        </DropdownMenu.Trigger>
        {isLoaded && (
          <DropdownMenu.Content className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
            <div className="flex items-center gap-x-3 px-2 py-1">
              <Avatar variant="squared" size="small" fallback={fallback} />
              <div className="flex flex-col overflow-hidden">
                <Text
                  size="small"
                  weight="plus"
                  leading="compact"
                  className="truncate"
                >
                  {name}
                </Text>
              </div>
            </div>
            <DropdownMenu.Separator />
            <Logout />
          </DropdownMenu.Content>
        )}
      </DropdownMenu>
    </div>
  )
}

const useCoreRoutes = (): Omit<INavItem, "pathname">[] => {
  const { t } = useTranslation()

  return [
    {
      icon: <ChartBar />,
      label: t("app.nav.main.overview", { defaultValue: "Overview" }),
      to: "/",
    },
    {
      icon: <Tag />,
      label: t("products.domain"),
      to: "/products",
    },
    {
      icon: <ShoppingCart />,
      label: t("orders.domain"),
      to: "/orders",
    },
    // tenant-panel wave 2: the sections Ivan listed 2026-09-11 (brief
    // docs/multitenancy/2026-09-11-night-2-panel-brief.md §3). Screens land
    // piece by piece; until then each opens routes/not-built.
    {
      icon: <Folder />,
      label: t("categories.domain"),
      to: "/categories",
    },
    {
      icon: <ReceiptPercent />,
      label: t("promotions.domain"),
      to: "/promotions",
      // tenant-panel wave 2, piece 6: Campaigns hangs under Promotions exactly as
      // it does in the Admin's own nav (components/layout/main-layout), which is
      // the only way the campaigns screens are reachable from the sidebar. The
      // nested list renders through the LayoutEditContext default (edit mode off,
      // nothing hidden, order unchanged), so no LayoutEditProvider is needed.
      items: [
        {
          label: t("campaigns.domain"),
          to: "/campaigns",
        },
      ],
    },
    {
      icon: <DocumentText />,
      label: t("app.nav.main.pages", { defaultValue: "Pages" }),
      to: "/pages",
    },
    {
      icon: <House />,
      label: t("app.nav.main.homeSettings", { defaultValue: "Home page" }),
      to: "/home-settings",
    },
    {
      // t04-shipping-tariffs: the shop's delivery methods (routes/shipping).
      icon: <RocketLaunch />,
      label: t("app.nav.main.shipping", { defaultValue: "Delivery" }),
      to: "/shipping",
    },
    {
      // t09-reviews: product reviews and their moderation (routes/reviews).
      icon: <ChatBubbleLeftRight />,
      label: t("app.nav.main.reviews", { defaultValue: "Reviews" }),
      to: "/reviews",
    },
  ]
}

/**
 * Static three-item nav. The Admin's version feeds every core route and
 * extension menu item through `LayoutComposer` so a user can reorder or hide
 * them; the panel has nothing to reorder (three fixed screens, no
 * extensions), so this renders the list directly.
 */
const SidebarRoutes = () => {
  const coreRoutes = useCoreRoutes()

  return (
    <nav className="py-3">
      <div className="flex flex-col gap-y-1 px-3">
        {coreRoutes.map((route) => (
          <NavItem key={route.to} {...route} />
        ))}
      </div>
    </nav>
  )
}

const UserSection = () => {
  return (
    <div>
      <div className="px-3">
        <Divider variant="dashed" />
      </div>
      <UserMenu />
    </div>
  )
}
