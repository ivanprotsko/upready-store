import { ArrowPath, ArrowUpRightOnBox, Link as LinkIcon, PencilSquare, XMarkMini } from "@medusajs/icons"
import { Button, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  slugOf,
  useMpProducts,
  type MarketplaceId,
  type MpLinkState,
  type MpProductRow,
} from "../../../hooks/api/marketplace-section"
import { useUnlinkMarketplaceCard } from "../../../hooks/api/marketplace-catalog"
import { CardCell, DateTimeCell, LinkStateCell, MoneyCell, UnitsCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { MpLinkDrawer } from "./components/mp-link-drawer"

/**
 * «Wildberries → Товары» (mp-section-design, Ivan 2026-10-05): every card the
 * import stored in `mp_product`, with the date and time it was last brought
 * over. The screen is «Товары» of the shop with the marketplace's columns:
 * the same `_DataTable`, the same filter row, search, sorting, pagination,
 * empty state and row menu, so the owner reads it the way she reads her own
 * catalog (the order: «интерфейс должен полностью повторять /products»).
 *
 * The LINK to the shop's product is one column and one filter here, not a
 * screen of its own: the old «Каталог маркетплейсов» split the articles into
 * four tabs and asked for thresholds before showing a single card.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["link_state", "category", "brand", "synced_at"] as const

const LINK_STATES: MpLinkState[] = ["linked", "needs_choice", "not_found"]

export const MpProducts = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { params, raw, dates } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)

  const { products, count, sync, categories, brands, isLoading, isError, error } = useMpProducts(
    marketplace,
    { ...params, link_state: params.link_state as MpLinkState[] | undefined, synced_at: dates.synced_at },
    { placeholderData: keepPreviousData }
  )

  const [linking, setLinking] = useState<MpProductRow | null>(null)
  const columns = useColumns(marketplace, setLinking)
  const filters = useFilters(categories ?? [], brands ?? [])

  const { table } = useDataTable({
    data: products ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const subtitle = sync
    ? sync.last_success_at
      ? t("mp.products.synced", {
          marketplace: label,
          at: getFullDate({ date: sync.last_success_at, includeTime: true }),
          count: sync.cards,
        })
      : t("mp.products.neverSynced", { marketplace: label })
    : null

  return (
    <MpPage
      title={t("mp.products.title")}
      subtitle={subtitle}
      actions={
        <Button size="small" variant="secondary" asChild>
          <Link to={`/marketplaces/${slugOf(marketplace)}/sync`}>
            <ArrowPath />
            {t("mp.products.refresh")}
          </Link>
        </Button>
      }
    >
      <_DataTable
        table={table}
        columns={columns}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        filters={filters}
        search
        pagination
        isLoading={isLoading}
        queryObject={raw}
        orderBy={[
          { key: "title", label: t("fields.title") },
          { key: "vendor_code", label: t("mp.fields.vendorCode") },
          { key: "price", label: t("fields.price") },
          { key: "stock", label: t("mp.fields.stock") },
          { key: "synced_at", label: t("mp.fields.syncedAt") },
        ]}
        noRecords={{
          title: t("mp.products.empty.title", { marketplace: label }),
          message: t("mp.products.empty.message", { marketplace: label }),
        }}
      />
      {linking ? (
        <MpLinkDrawer product={linking} onClose={() => setLinking(null)} />
      ) : null}
    </MpPage>
  )
}

const columnHelper = createColumnHelper<MpProductRow>()

const useColumns = (marketplace: MarketplaceId, onLink: (row: MpProductRow) => void) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <CardCell title={row.original.title} thumbnail={row.original.thumbnail} />
        ),
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("vendor_code", {
        header: () => <span>{t("mp.fields.vendorCode")}</span>,
        cell: ({ getValue }) => (
          <span className="text-ui-fg-subtle truncate tabular-nums">{getValue() ?? "—"}</span>
        ),
      }),
      columnHelper.display({
        id: "price",
        header: () => <span>{t("fields.price")}</span>,
        cell: ({ row }) => (
          <MoneyCell
            amount={row.original.discount_price ?? row.original.price}
            strike={row.original.discount_price ? row.original.price : null}
            currency={row.original.currency}
          />
        ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.accessor("stock", {
        header: () => <span>{t("mp.fields.stock")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      columnHelper.display({
        id: "link",
        header: () => <span>{t("mp.fields.link")}</span>,
        cell: ({ row }) => (
          <LinkStateCell state={row.original.link.state} productTitle={row.original.link.product_title} />
        ),
        meta: { phoneWide: true },
      }),
      columnHelper.accessor("synced_at", {
        header: () => <span>{t("mp.fields.syncedAt")}</span>,
        cell: ({ getValue }) => <DateTimeCell date={getValue()} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <RowActions row={row.original} marketplace={marketplace} onLink={onLink} />,
      }),
    ],
    [t, marketplace, onLink]
  )
}

const RowActions = ({
  row,
  marketplace,
  onLink,
}: {
  row: MpProductRow
  marketplace: MarketplaceId
  onLink: (row: MpProductRow) => void
}) => {
  const { t } = useTranslation()
  const { mutateAsync: unlink } = useUnlinkMarketplaceCard()
  const label = MARKETPLACE_LABEL[marketplace]

  const handleUnlink = async () => {
    if (MP_FIXTURES) {
      toast.success(t("mp.products.toasts.unlinked", { title: row.title ?? row.external_id }))
      return
    }
    try {
      await unlink(row.link.variant_id ?? row.id)
      toast.success(t("mp.products.toasts.unlinked", { title: row.title ?? row.external_id }))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            ...(row.url
              ? [
                  {
                    icon: <ArrowUpRightOnBox />,
                    label: t("mp.products.actions.openOnMarketplace", { marketplace: label }),
                    to: row.url,
                  },
                ]
              : []),
            ...(row.link.product_id
              ? [
                  {
                    icon: <PencilSquare />,
                    label: t("mp.products.actions.openShopProduct"),
                    to: `/products/${row.link.product_id}`,
                  },
                ]
              : []),
          ],
        },
        {
          actions:
            row.link.state === "linked"
              ? [{ icon: <XMarkMini />, label: t("mp.products.actions.unlink"), onClick: handleUnlink }]
              : [
                  {
                    icon: <LinkIcon />,
                    label:
                      row.link.state === "needs_choice"
                        ? t("mp.products.actions.choose")
                        : t("mp.products.actions.link"),
                    onClick: () => onLink(row),
                  },
                ],
        },
      ]}
    />
  )
}

const useFilters = (
  categories: Array<{ value: string; label: string }>,
  brands: Array<{ value: string; label: string }>
): Filter[] => {
  const { t } = useTranslation()
  return useMemo(() => {
    const filters: Filter[] = [
      {
        key: "link_state",
        label: t("mp.fields.link"),
        type: "select",
        multiple: true,
        options: LINK_STATES.map((state) => ({ label: t(`mp.linkState.${state}`), value: state })),
      },
    ]
    if (categories.length) {
      filters.push({
        key: "category",
        label: t("fields.category"),
        type: "select",
        multiple: true,
        searchable: true,
        options: categories.map((c) => ({ label: c.label, value: c.value })),
      })
    }
    if (brands.length) {
      filters.push({
        key: "brand",
        label: t("mp.fields.brand"),
        type: "select",
        multiple: true,
        searchable: true,
        options: brands.map((b) => ({ label: b.label, value: b.value })),
      })
    }
    filters.push({ key: "synced_at", label: t("mp.fields.syncedAt"), type: "date" })
    return filters
  }, [t, categories, brands])
}
