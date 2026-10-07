import { MagnifyingGlass, Spinner } from "@medusajs/icons"
import { Button, Kbd, Text, clx } from "@medusajs/ui"
import { Command } from "cmdk"
import { Dialog as RadixDialog } from "radix-ui"
import {
  ComponentPropsWithoutRef,
  ElementRef,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"

import { useLogout } from "../../hooks/api/auth"
import { useOrders } from "../../hooks/api/orders"
import { useProducts } from "../../hooks/api/products"
import { useDebouncedSearch } from "../../hooks/use-debounced-search"
import { usePermissions } from "../../hooks/use-permissions"
import { useShopUrl } from "../../hooks/use-shop-url"
import { OWNER_NAV } from "../layout/owner-nav/nav-model"
import {
  COMMAND_MENU_RESULT_LIMIT,
  CommandMenuRun,
  commandMenuActions,
  commandMenuNavigation,
  commandMenuSearchTerm,
  filterCommands,
  listSearchPath,
  orderPath,
  pathKeywords,
  productPath,
} from "../../lib/command-menu"
import { visibleNav } from "../../lib/permissions"
import { queryClient } from "../../lib/query-client"
import { useCommandMenu } from "../../providers/command-menu-provider/use-command-menu"
import { useTheme } from "../../providers/theme-provider"
import { Skeleton } from "../common/skeleton"
import { Thumbnail } from "../common/thumbnail"

// tenant-panel (ask-20261005-112844-10ba): the owner's command menu. The
// dialog, input, list, group, item and empty parts below are the Admin's
// components/search/search.tsx (@medusajs/dashboard 2.19.0), so the palette
// looks like the Admin's ⌘K search; its loading skeleton lives inside the
// empty part here (see `CommandEmpty`). What changed is what
// it lists: the Admin asks `/admin/search` across 22 entity kinds and offers
// its keyboard shortcuts; the panel has no search route, so it lists the
// sidebar's screens (`lib/command-menu.ts`), the actions the panel already has,
// and products and orders from `/tenants/products?q=` and `/tenants/orders?q=`.
// The area dropdown above the input is gone: four groups need no picker.

type Row = {
  id: string
  label: string
  keywords?: string[]
  hint?: string
  thumbnail?: string
  to?: string
  run?: CommandMenuRun
}

export const CommandMenu = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { open, onOpenChange } = useCommandMenu()
  const { searchValue, onSearchValueChange, query } = useDebouncedSearch()
  const run = useRunCommand()
  // t-2026-10-07-11: the menu lists and searches only what the login may open.
  const { permissions, can } = usePermissions()

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const term = open && query ? commandMenuSearchTerm(query) : ""
  const products = useProducts(
    {
      q: term,
      limit: COMMAND_MENU_RESULT_LIMIT,
      fields: "id,title,thumbnail",
      is_giftcard: false,
    },
    { enabled: !!term && can("catalog"), staleTime: 30_000 }
  )
  const orders = useOrders(
    {
      q: term,
      limit: COMMAND_MENU_RESULT_LIMIT,
      fields: "id,display_id,email",
    },
    { enabled: !!term && can("orders"), staleTime: 30_000 }
  )
  const isFetching = !!term && (products.isFetching || orders.isFetching)

  const navigation = useMemo<Row[]>(
    () =>
      commandMenuNavigation(visibleNav(OWNER_NAV, permissions)).map((entry) => {
        const own = entry.label ?? t(entry.labelKey)
        const parent = entry.parent ? entry.parent.label ?? t(entry.parent.labelKey) : null
        const group = entry.groupLabelKey ? t(entry.groupLabelKey) : undefined
        return {
          id: entry.id,
          label: parent ? `${parent} · ${own}` : own,
          hint: group,
          keywords: [...(group ? [group] : []), ...pathKeywords(entry.to)],
          to: entry.to,
        }
      }),
    [t, permissions]
  )
  const actions = useMemo<Row[]>(
    () =>
      commandMenuActions(permissions).map((action) => ({
        id: action.id,
        label: t(action.labelKey),
        keywords: action.to ? pathKeywords(action.to) : [],
        to: action.to,
        run: action.run,
      })),
    [t, permissions]
  )

  const shownNavigation = useMemo(
    () => filterCommands(navigation, searchValue),
    [navigation, searchValue]
  )
  const shownActions = useMemo(() => filterCommands(actions, searchValue), [actions, searchValue])

  const productRows: Row[] = term
    ? (products.products ?? []).map((product) => ({
        id: `product:${product.id}`,
        label: product.title,
        to: productPath(product.id),
        thumbnail: product.thumbnail ?? undefined,
      }))
    : []
  const orderRows: Row[] = term
    ? (orders.orders ?? []).map((order) => ({
        id: `order:${order.id}`,
        label: t("app.commandMenu.orderTitle", { number: order.display_id }),
        hint: order.email ?? undefined,
        to: orderPath(order.id),
      }))
    : []

  const handleReset = useCallback(() => {
    onSearchValueChange("")
  }, [onSearchValueChange])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        handleReset()
      }
      onOpenChange(next)
    },
    [onOpenChange, handleReset]
  )

  useEffect(() => {
    handleOpenChange(false)
  }, [location.pathname, handleOpenChange])

  const handleSelect = (row: { to?: string; run?: CommandMenuRun }) => {
    handleOpenChange(false)
    if (row.to) {
      navigate(row.to)
      return
    }
    if (row.run) {
      run(row.run)
    }
  }

  const handleSearch = (value: string) => {
    onSearchValueChange(value)
    listRef.current?.scrollTo({ top: 0 })
  }

  // While the search the input is about to send (or has sent) is unanswered,
  // the empty state is a skeleton, so «Ничего не найдено» never flashes between
  // a keystroke and its answer.
  const searchPending = !!commandMenuSearchTerm(searchValue) && (searchValue !== query || isFetching)

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        ref={inputRef}
        isFetching={isFetching}
        value={searchValue}
        onValueChange={handleSearch}
        placeholder={t("app.commandMenu.placeholder")}
      />
      <CommandList ref={listRef}>
        {!searchValue && (
          <RowGroup heading={t("app.commandMenu.groups.actions")} rows={shownActions} onSelect={handleSelect} />
        )}
        <RowGroup
          heading={t("app.commandMenu.groups.navigation")}
          rows={shownNavigation}
          onSelect={handleSelect}
          hint={(row) => row.hint}
        />
        {!!searchValue && (
          <RowGroup heading={t("app.commandMenu.groups.actions")} rows={shownActions} onSelect={handleSelect} />
        )}
        <RowGroup
          heading={t("app.commandMenu.groups.products")}
          rows={productRows}
          onSelect={handleSelect}
          icon={(row) => <Thumbnail alt={row.label} src={row.thumbnail} size="small" />}
          more={
            (products.count ?? 0) > productRows.length && productRows.length > 0
              ? {
                  id: "products:all",
                  label: t("app.commandMenu.allProducts", { count: products.count }),
                  to: listSearchPath("/products", term),
                }
              : undefined
          }
        />
        <RowGroup
          heading={t("app.commandMenu.groups.orders")}
          rows={orderRows}
          onSelect={handleSelect}
          hint={(row) => row.hint}
          more={
            (orders.count ?? 0) > orderRows.length && orderRows.length > 0
              ? {
                  id: "orders:all",
                  label: t("app.commandMenu.allOrders", { count: orders.count }),
                  to: listSearchPath("/orders", term),
                }
              : undefined
          }
        />
        {/* Always mounted: cmdk 0.2's Empty renders nothing on its first render
            and only shows after the item count changes, so an Empty mounted
            once the list is already empty would never appear. */}
        <CommandEmpty q={searchValue} pending={searchPending} />
      </CommandList>
    </CommandDialog>
  )
}

const RowGroup = ({
  heading,
  rows,
  onSelect,
  hint,
  icon,
  more,
}: {
  heading: string
  rows: Row[]
  onSelect: (row: Row) => void
  hint?: (row: Row) => string | undefined
  icon?: (row: Row) => ReactNode
  more?: Row
}) => {
  if (!rows.length) {
    return null
  }
  return (
    <CommandGroup heading={heading}>
      {rows.map((row) => (
        <CommandItem
          key={row.id}
          value={row.id}
          onSelect={() => onSelect(row)}
          className="flex items-center justify-between"
        >
          <div className="flex min-w-0 items-center gap-x-3">
            {icon?.(row)}
            <span className="truncate">{row.label}</span>
          </div>
          {hint?.(row) && (
            <span className="text-ui-fg-muted txt-compact-small shrink-0 truncate">{hint(row)}</span>
          )}
        </CommandItem>
      ))}
      {more && (
        <CommandItem key={more.id} value={more.id} onSelect={() => onSelect(more)}>
          <div className="text-ui-fg-muted flex items-center gap-x-3">
            <MagnifyingGlass />
            <Text size="small" leading="compact" weight="plus">
              {more.label}
            </Text>
          </div>
        </CommandItem>
      )}
    </CommandGroup>
  )
}

/** The actions that are not a screen: what `run` names, done the way the panel does it elsewhere. */
const useRunCommand = () => {
  const navigate = useNavigate()
  const shopUrl = useShopUrl()
  const { theme, setTheme } = useTheme()
  const { mutateAsync: logout } = useLogout()

  return (command: CommandMenuRun) => {
    switch (command) {
      case "openShop":
        if (shopUrl) {
          window.open(shopUrl, "_blank", "noreferrer")
        }
        return
      case "toggleTheme": {
        // `system` resolves to whatever the page shows now.
        const dark =
          theme === "dark" ||
          (theme === "system" && document.documentElement.classList.contains("dark"))
        setTheme(dark ? "light" : "dark")
        return
      }
      case "logout":
        // The sidebar's «Выйти» (main-layout.tsx `Logout`), as is.
        void logout(undefined, {
          onSuccess: () => {
            queryClient.clear()
            navigate("/login")
          },
        })
        return
    }
  }
}

// ---------------------------------------------------------------------------
// Below: the Admin's search.tsx parts (@medusajs/dashboard 2.19.0), unchanged
// except where a comment says so.
// ---------------------------------------------------------------------------

const CommandPalette = forwardRef<
  ElementRef<typeof Command>,
  ComponentPropsWithoutRef<typeof Command>
>(({ className, ...props }, ref) => (
  <Command
    shouldFilter={false}
    ref={ref}
    className={clx(
      "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
      className
    )}
    {...props}
  />
))
CommandPalette.displayName = Command.displayName

const CommandDialog = ({ children, ...props }: RadixDialog.DialogProps) => {
  const { t } = useTranslation()

  return (
    <RadixDialog.Root {...props}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="bg-ui-bg-overlay fixed inset-0" />
        <RadixDialog.Content
          // tenant-panel: `data-testid` for the snapshots; the Admin's
          // `preserveHeight` is dropped with the `isLoading` prop nobody passed.
          data-testid="command-menu"
          className="bg-ui-bg-base shadow-elevation-modal fixed left-[50%] top-[50%] flex max-h-[calc(100%-16px)] w-[calc(100%-16px)] min-w-0 max-w-2xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl p-0"
        >
          <RadixDialog.Title className="sr-only">{t("app.commandMenu.title")}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {t("app.commandMenu.description")}
          </RadixDialog.Description>
          <CommandPalette className="[&_[cmdk-group-heading]]:text-muted-foreground flex h-full flex-col overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0">
            {children}
          </CommandPalette>
          {/* tenant-panel: hidden on touch widths, where there are no arrow keys. */}
          <div className="bg-ui-bg-field text-ui-fg-subtle flex items-center justify-end border-t px-4 py-3 max-sm:hidden">
            <div className="flex items-center gap-x-3">
              <div className="flex items-center gap-x-2">
                <Text size="xsmall" leading="compact">
                  {t("app.search.navigation")}
                </Text>
                <div className="flex items-center gap-x-1">
                  <Kbd className="bg-ui-bg-field-component">↓</Kbd>
                  <Kbd className="bg-ui-bg-field-component">↑</Kbd>
                </div>
              </div>
              <div className="bg-ui-border-strong h-3 w-px" />
              <div className="flex items-center gap-x-2">
                <Text size="xsmall" leading="compact">
                  {t("app.search.openResult")}
                </Text>
                <Kbd className="bg-ui-bg-field-component">↵</Kbd>
              </div>
              <div className="bg-ui-border-strong h-3 w-px" />
              <div className="flex items-center gap-x-2">
                <Text size="xsmall" leading="compact">
                  {t("app.commandMenu.close")}
                </Text>
                <Kbd className="bg-ui-bg-field-component">Esc</Kbd>
              </div>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

// tenant-panel: without the area dropdown and the «back» button that only
// left a chosen area.
const CommandInput = forwardRef<
  ElementRef<typeof Command.Input>,
  ComponentPropsWithoutRef<typeof Command.Input> & {
    isFetching: boolean
  }
>(({ className, value, onValueChange, isFetching, ...props }, ref) => {
  const { t } = useTranslation()
  const innerRef = useRef<HTMLInputElement>(null)
  useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
    ref,
    () => innerRef.current
  )

  return (
    <div className="flex flex-col border-b">
      <div className="relative flex items-center gap-x-2 px-4 py-3">
        <MagnifyingGlass className="text-ui-fg-muted shrink-0" />
        <Command.Input
          ref={innerRef}
          value={value}
          onValueChange={onValueChange}
          className={clx(
            "placeholder:text-ui-fg-muted flex !h-6 w-full rounded-md bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <div className="absolute end-4 top-1/2 flex -translate-y-1/2 items-center justify-end gap-x-2">
          {isFetching && <Spinner className="text-ui-fg-muted animate-spin" />}
          {value && (
            <Button
              variant="transparent"
              size="small"
              className="text-ui-fg-muted hover:text-ui-fg-subtle"
              type="button"
              onClick={() => {
                onValueChange?.("")
                innerRef.current?.focus()
              }}
            >
              {t("actions.clear")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})

CommandInput.displayName = Command.Input.displayName

const CommandList = forwardRef<
  ElementRef<typeof Command.List>,
  ComponentPropsWithoutRef<typeof Command.List>
>(({ className, ...props }, ref) => (
  <Command.List
    ref={ref}
    className={clx(
      // tenant-panel: 360 px instead of 300, so the actions and the first
      // screens both fit before the list scrolls.
      "max-h-[360px] flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4",
      className
    )}
    {...props}
  />
))

CommandList.displayName = Command.List.displayName

const CommandEmpty = forwardRef<
  ElementRef<typeof Command.Empty>,
  Omit<ComponentPropsWithoutRef<typeof Command.Empty>, "children"> & {
    q?: string
    /** tenant-panel: the answer is on its way; the Admin's `CommandLoading` skeleton. */
    pending?: boolean
  }
>(({ q, pending, ...props }, ref) => {
  const { t } = useTranslation()

  if (pending) {
    return (
      <Command.Empty ref={ref} {...props}>
        <div className="bg-ui-bg-base flex flex-col">
          <div className="w-full px-2 pb-1 pt-3">
            <Skeleton className="h-5 w-10" />
          </div>
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="w-full p-2">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </Command.Empty>
    )
  }

  return (
    <Command.Empty ref={ref} className="py-6 text-center text-sm" {...props}>
      <div
        data-testid="command-menu-empty"
        className="text-ui-fg-subtle flex min-h-[236px] flex-col items-center justify-center gap-y-3"
      >
        <MagnifyingGlass className="text-ui-fg-subtle" />
        <div className="flex flex-col items-center justify-center gap-y-1">
          <Text size="small" weight="plus" leading="compact">
            {q ? t("app.search.noResultsTitle") : t("app.search.emptySearchTitle")}
          </Text>
          <Text size="small" className="text-ui-fg-muted">
            {q ? t("app.commandMenu.noResultsMessage") : t("app.search.emptySearchMessage")}
          </Text>
        </div>
      </div>
    </Command.Empty>
  )
})

CommandEmpty.displayName = Command.Empty.displayName

const CommandGroup = forwardRef<
  ElementRef<typeof Command.Group>,
  ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, ...props }, ref) => (
  <Command.Group
    ref={ref}
    className={clx(
      "text-ui-fg-base [&_[cmdk-group-heading]]:text-ui-fg-muted [&_[cmdk-group-heading]]:txt-compact-xsmall-plus overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-item]]:py-2",
      className
    )}
    {...props}
  />
))

CommandGroup.displayName = Command.Group.displayName

const CommandItem = forwardRef<
  ElementRef<typeof Command.Item>,
  ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, ...props }, ref) => (
  <Command.Item
    ref={ref}
    className={clx(
      "aria-selected:bg-ui-bg-base-hover focus-visible:bg-ui-bg-base-hover txt-compact-small [&>svg]:text-ui-fg-subtle relative flex cursor-pointer select-none items-center gap-x-3 rounded-md p-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className
    )}
    {...props}
  />
))

CommandItem.displayName = Command.Item.displayName
