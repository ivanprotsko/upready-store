import { BuildingStorefront, ChartBar, ShoppingBag, TriangleRightMini } from "@medusajs/icons"
import { Text, clx } from "@medusajs/ui"
import { ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { useOrders } from "../../../hooks/api/orders"
import { useTenantReviews } from "../../../hooks/api/reviews"
import { isOrderWithoutParcel } from "../../../lib/order-helpers"
import {
  OWNER_HOME,
  OWNER_NAV,
  OwnerCounter,
  OwnerNavGroup,
  OwnerNavItem,
  findActive,
  findParent,
} from "./nav-model"

const STORAGE_KEY = "owner-nav-closed-groups"

const readClosed = (): string[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * What waits for the owner, shown as a number on the menu entry. Both reads
 * are small and fail silently: a menu without a number is still a menu.
 */
export const useOwnerCounters = (): Record<OwnerCounter, number | null> => {
  const orders = useOrders(
    { limit: 50, fields: "id,status,fulfillment_status,items.requires_shipping" },
    { staleTime: 60_000, retry: false }
  )
  const reviews = useTenantReviews(
    { status: "pending", limit: 1 },
    { staleTime: 60_000, retry: false }
  )

  const toPack = orders.orders
    ? orders.orders.filter(
        (o) =>
          o.status !== "canceled" &&
          o.fulfillment_status === "not_fulfilled" &&
          !isOrderWithoutParcel(o)
      ).length
    : null

  return {
    ordersToPack: toPack,
    reviewsToModerate: typeof reviews.count === "number" ? reviews.count : null,
  }
}

// A row grows with its label (`min-h`, never a fixed height): a label that
// wraps used to paint over its neighbours. 44 px on touch widths.
const ROW =
  "transition-fg flex min-h-8 w-full items-center gap-x-2 rounded-md px-2 py-1 outline-none max-lg:min-h-11 focus-visible:shadow-borders-focus"
const ROW_IDLE = "text-ui-fg-subtle hover:bg-ui-bg-subtle-hover"
const ROW_ACTIVE = "bg-ui-bg-base shadow-elevation-card-rest text-ui-fg-base"

const Counter = ({ value, label }: { value: number | null; label: string }) => {
  if (!value) {
    return null
  }
  return (
    <span
      className="bg-ui-tag-orange-bg text-ui-tag-orange-text txt-compact-xsmall-plus ms-auto rounded-full px-1.5 py-0.5"
      aria-label={label}
    >
      {value > 49 ? "49+" : value}
    </span>
  )
}

const ItemLink = ({
  item,
  active,
  counter,
  nested,
  icon,
  trailing,
}: {
  item: OwnerNavItem
  active: boolean
  counter: number | null
  nested: boolean
  icon?: ReactNode
  trailing?: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={clx(ROW, active ? ROW_ACTIVE : ROW_IDLE, nested && "ps-8")}
    >
      {!nested && (icon ?? <ChartBar className="text-ui-fg-subtle shrink-0" />)}
      <Text size="small" weight="plus" leading="compact" className="min-w-0 break-words">
        {item.label ?? t(item.labelKey)}
      </Text>
      {trailing}
      {item.counter && (
        <Counter
          value={counter}
          label={t(`app.nav.owner.counters.${item.counter}`, { count: counter ?? 0 })}
        />
      )}
    </Link>
  )
}

/**
 * An entry that unfolds into its screens («Wildberries» → «Товары», «Цены и
 * остатки», …), drawn the way an Admin route with nested items is: the entry
 * is a link to its first screen, the chevron folds the list, and a child is
 * the row that lights up. Arriving on a child opens the list.
 */
const ParentItem = ({
  item,
  activeTo,
  open,
  onToggle,
}: {
  item: OwnerNavItem
  activeTo: string | null
  open: boolean
  onToggle: () => void
}) => {
  const { t } = useTranslation()
  const panelId = `owner-nav-${item.to.replace(/\W+/g, "-")}`
  const insideActive = item.children?.some((child) => child.to === activeTo) ?? false

  return (
    <li>
      <div className="flex items-center gap-x-1">
        <div className="min-w-0 flex-1">
          <ItemLink
            item={item}
            nested={false}
            icon={<ShoppingBag className="text-ui-fg-subtle shrink-0" />}
            active={activeTo === item.to && !insideActive}
            counter={null}
          />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? t("app.nav.owner.fold") : t("app.nav.owner.unfold")}
          className="text-ui-fg-muted hover:bg-ui-bg-subtle-hover transition-fg flex h-7 w-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:shadow-borders-focus max-lg:h-11 max-lg:w-11"
        >
          <TriangleRightMini
            className={clx("transition-transform rtl:rotate-180", open && "rotate-90")}
          />
        </button>
      </div>
      {open && item.children ? (
        <ul id={panelId} className="flex flex-col gap-y-0.5 pb-1">
          {item.children.map((child) => (
            <li key={child.to}>
              <ItemLink item={child} nested active={activeTo === child.to} counter={null} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** «Скоро» next to an entry that is drawn before it is built (the Ozon stub). */
const StubMark = () => {
  const { t } = useTranslation()
  return (
    <span className="bg-ui-bg-component text-ui-fg-muted txt-compact-xsmall-plus border-ui-border-base ms-auto rounded-full border px-1.5 py-0.5">
      {t("app.nav.owner.stub")}
    </span>
  )
}

/**
 * A section title that is not a link and never folds, the way Medusa Admin
 * draws «Extensions» above the routes a plugin adds (Ivan, 2026-10-05). The
 * entries under it are top-level rows with icons; the one with children is
 * the only thing here that folds.
 */
const HeadingGroup = ({
  group,
  activeTo,
  openParents,
  onToggleParent,
}: {
  group: OwnerNavGroup
  activeTo: string | null
  openParents: string[]
  onToggleParent: (to: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <li className="pt-2">
      <div className="px-2 pb-1 pt-2">
        <Text size="xsmall" weight="plus" leading="compact" className="text-ui-fg-muted">
          {t(group.labelKey)}
        </Text>
      </div>
      <ul className="flex flex-col gap-y-0.5">
        {group.items.map((item) =>
          item.children ? (
            <ParentItem
              key={item.to}
              item={item}
              activeTo={activeTo}
              open={openParents.includes(item.to)}
              onToggle={() => onToggleParent(item.to)}
            />
          ) : (
            <li key={item.to}>
              <ItemLink
                item={item}
                nested={false}
                icon={<ShoppingBag className="text-ui-fg-subtle shrink-0" />}
                active={activeTo === item.to}
                counter={null}
                trailing={item.stub ? <StubMark /> : undefined}
              />
            </li>
          )
        )}
      </ul>
    </li>
  )
}

const Group = ({
  group,
  open,
  onToggle,
  activeTo,
  counters,
}: {
  group: OwnerNavGroup
  open: boolean
  onToggle: () => void
  activeTo: string | null
  counters: Record<OwnerCounter, number | null>
}) => {
  const { t } = useTranslation()
  const panelId = `owner-nav-${group.id}`
  // A closed group still tells that something inside waits for her.
  const hidden = group.items.reduce(
    (sum, item) => sum + (item.counter ? counters[item.counter] ?? 0 : 0),
    0
  )

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={clx(ROW, "text-ui-fg-muted hover:bg-ui-bg-subtle-hover")}
      >
        <TriangleRightMini
          className={clx("shrink-0 transition-transform rtl:rotate-180", open && "rotate-90")}
        />
        <Text size="small" weight="plus" leading="compact" className="min-w-0 break-words text-start">
          {t(group.labelKey)}
        </Text>
        {!open && <Counter value={hidden} label={t("app.nav.owner.counters.inGroup")} />}
      </button>
      {open && (
        <ul id={panelId} className="flex flex-col gap-y-0.5 pb-1">
          {group.items.map((item) => (
            <li key={item.to}>
              <ItemLink
                item={item}
                nested
                active={activeTo === item.to}
                counter={item.counter ? counters[item.counter] : null}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The owner's sidebar: «Обзор» and six groups named after her jobs. Arriving on
 * a screen opens its group; otherwise the groups remember what she closed.
 */
export const OwnerNav = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const counters = useOwnerCounters()
  const [closed, setClosed] = useState<string[]>(readClosed)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(closed))
    } catch {
      // Private mode: the groups simply open again next time.
    }
  }, [closed])

  const active = findActive(pathname)
  const activeTo = active?.item.to ?? null
  const activeGroup = active?.group?.id ?? null
  const parentTo = findParent(pathname)?.to ?? null

  // An entry with children starts open and remembers what she folded, like a
  // group; arriving on one of its screens opens it again.
  const [openParents, setOpenParents] = useState<string[]>(() =>
    OWNER_NAV.flatMap((group) =>
      group.items.filter((item) => item.children).map((item) => item.to)
    )
  )
  useEffect(() => {
    if (parentTo) {
      setOpenParents((now) => (now.includes(parentTo) ? now : [...now, parentTo]))
    }
  }, [parentTo])
  const toggleParent = (to: string) =>
    setOpenParents((now) => (now.includes(to) ? now.filter((p) => p !== to) : [...now, to]))

  // Arriving on a screen opens its group, so the active item is never hidden
  // by a group she closed earlier.
  useEffect(() => {
    if (activeGroup) {
      setClosed((now) => (now.includes(activeGroup) ? now.filter((g) => g !== activeGroup) : now))
    }
  }, [activeGroup])

  const toggle = (id: string) =>
    setClosed((now) => (now.includes(id) ? now.filter((g) => g !== id) : [...now, id]))

  return (
    <nav className="py-3" aria-label={t("app.nav.owner.label")}>
      <ul className="flex flex-col gap-y-0.5 px-3">
        <li>
          <ItemLink
            item={OWNER_HOME}
            nested={false}
            active={activeTo === OWNER_HOME.to}
            counter={null}
          />
        </li>
        {OWNER_NAV.map((group) =>
          group.heading ? (
            <HeadingGroup
              key={group.id}
              group={group}
              activeTo={activeTo}
              openParents={openParents}
              onToggleParent={toggleParent}
            />
          ) : group.flat ? (
            <li key={group.id}>
              <ItemLink
                item={group.items[0]}
                nested={false}
                icon={<BuildingStorefront className="text-ui-fg-subtle shrink-0" />}
                active={activeTo === group.items[0].to}
                counter={null}
              />
            </li>
          ) : (
          <Group
            key={group.id}
            group={group}
            open={!closed.includes(group.id)}
            onToggle={() => toggle(group.id)}
            activeTo={activeTo}
            counters={counters}
          />
          )
        )}
      </ul>
    </nav>
  )
}
