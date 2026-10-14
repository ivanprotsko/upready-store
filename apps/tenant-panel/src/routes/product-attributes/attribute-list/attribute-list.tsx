import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, StatusBadge, Text, toast } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useProductCategories } from "../../../hooks/api/categories"
import {
  ProductAttribute,
  useApplyProductAttributePreset,
  useProductAttributePreset,
  useProductAttributes,
} from "../../../hooks/api/product-attributes"
import { useDataTable } from "../../../hooks/use-data-table"
import { useQueryParams } from "../../../hooks/use-query-params"
import { attributeListPage } from "../attribute-model"
import { useAttributeDelete } from "../use-attribute-delete"

// t15-product-attributes: the shop's own characteristics. The list is the
// SCHEMA, not the data: one row per characteristic the owner declared, with
// the two flags that decide where it shows up. Values live on each product.
//
// t-2026-10-14-01 (panel redesign, G2, prototype states `attributes*`): the
// list after panel-ds E1, E8 and E10. The header has one phrase and two
// buttons, «Добавить стандартные» and «Создать» (the way Import stands next to
// Create in the native admin); the line about the starting set became the
// button's state and its toast. The quick-add form under the table became the
// modal `create`. The two flags got a column each, said in words. A row opens
// the card; its «…» holds «Изменить» and, after the separator, «Удалить».

const PAGE_SIZE = 20

const columnHelper = createColumnHelper<ProductAttribute>()

const AttributeRowActions = ({ attribute }: { attribute: ProductAttribute }) => {
  const { t } = useTranslation()
  const remove = useAttributeDelete(attribute)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("actions.change"),
              to: `/product-attributes/${attribute.id}/edit`,
            },
          ],
        },
        {
          actions: [
            {
              icon: <Trash />,
              label: t("actions.delete"),
              onClick: () => void remove(),
            },
          ],
        },
      ]}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

const useColumns = (categoryName: (id: string | null) => string) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("productAttributes.columns.name"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" weight="plus" className="truncate" title={getValue()}>
            {getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor("key", {
        header: t("productAttributes.columns.key"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle font-mono truncate" title={getValue()}>
            {getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor("type", {
        header: t("productAttributes.columns.type"),
        cell: ({ row }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle whitespace-nowrap">
            {row.original.unit
              ? t("productAttributes.typeWithUnit", {
                  type: t(`productAttributes.types.${row.original.type}`),
                  unit: row.original.unit,
                })
              : t(`productAttributes.types.${row.original.type}`)}
          </Text>
        ),
      }),
      columnHelper.accessor("category_id", {
        header: t("productAttributes.columns.category"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle truncate" title={categoryName(getValue())}>
            {categoryName(getValue())}
          </Text>
        ),
      }),
      columnHelper.accessor("show_on_product", {
        header: t("productAttributes.columns.showOnProduct"),
        cell: ({ getValue }) => (
          <StatusBadge color={getValue() ? "green" : "grey"} className="whitespace-nowrap">
            {getValue() ? t("productAttributes.shown") : t("productAttributes.hidden")}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor("use_as_filter", {
        header: t("productAttributes.columns.filter"),
        cell: ({ getValue }) => (
          <StatusBadge color={getValue() ? "green" : "grey"} className="whitespace-nowrap">
            {getValue() ? t("productAttributes.filterOn") : t("productAttributes.filterOff")}
          </StatusBadge>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <AttributeRowActions attribute={row.original} />,
      }),
    ],
    [t, categoryName]
  )
}

export const AttributeList = () => {
  const { t } = useTranslation()
  const { q, offset } = useQueryParams(["q", "offset"])
  const { product_attributes: attributes, isPending, isError, error } = useProductAttributes()
  const { product_categories: categories } = useProductCategories({ limit: 200 })
  const { preset, missing } = useProductAttributePreset()
  const { mutateAsync: applyPreset, isPending: isApplyingPreset } =
    useApplyProductAttributePreset()

  const categoryName = useMemo(
    () => (categoryId: string | null) =>
      !categoryId
        ? t("productAttributes.allCatalog")
        : (categories?.find((category) => category.id === categoryId)?.name ??
          t("productAttributes.categoryGone")),
    [categories, t]
  )
  const columns = useColumns(categoryName)
  const page = useMemo(
    () =>
      attributeListPage(attributes ?? [], { q, offset: Number(offset) || 0, limit: PAGE_SIZE }),
    [attributes, q, offset]
  )
  const { table } = useDataTable({
    data: page.rows,
    columns,
    count: page.count,
    pageSize: PAGE_SIZE,
    enablePagination: true,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  if (isPending || !attributes) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  // b04-product-attributes: the starting set. The call only creates what is
  // missing, so pressing it twice changes nothing and a characteristic the
  // owner renamed keeps its name. The toast says how many it added.
  const handleApplyPreset = async () => {
    await applyPreset(undefined, {
      onSuccess: (result) =>
        toast.success(
          result.created.length
            ? t("productAttributes.preset.added", { count: result.created.length })
            : t("productAttributes.preset.none")
        ),
      onError: (presetError) => toast.error(presetError.message),
    }).catch(() => undefined)
  }

  const hasAttributes = attributes.length > 0

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <Container className="divide-y p-0" data-testid="product-attributes">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("productAttributes.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("productAttributes.subtitle")}
            </Text>
          </div>
          <div className="flex shrink-0 items-center gap-x-2">
            <Button
              size="small"
              variant="secondary"
              onClick={handleApplyPreset}
              isLoading={isApplyingPreset}
              disabled={!preset || missing === 0}
            >
              {t("productAttributes.preset.apply")}
            </Button>
            {hasAttributes ? (
              <Link to="/product-attributes/create">
                <Button size="small" variant="secondary">
                  {t("actions.create")}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        {!hasAttributes ? (
          <NoRecords
            title={t("productAttributes.empty.title")}
            message={t("productAttributes.empty.message")}
            action={{ to: "/product-attributes/create", label: t("actions.create") }}
          />
        ) : (
          <_DataTable
            table={table}
            columns={columns}
            count={page.count}
            pageSize={PAGE_SIZE}
            pagination
            search
            queryObject={{ q }}
            navigateTo={(row) => `/product-attributes/${row.original.id}`}
          />
        )}
      </Container>
    </SingleColumnPage>
  )
}
