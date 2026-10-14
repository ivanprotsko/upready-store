import {
  ArrowLongDown,
  ArrowLongUp,
  EllipsisHorizontal,
  Eye,
  EyeSlash,
  PencilSquare,
  Trash,
} from "@medusajs/icons"
import { Button, Container, Heading, IconButton, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { SettingsDetailSection } from "../../../components/settings"
import { _DataTable } from "../../../components/table/data-table"
import {
  useShippingMethods,
  type TenantShippingMethod,
} from "../../../hooks/api/shipping-methods"
import { useDataTable } from "../../../hooks/use-data-table"
import { panelLocale } from "../../../lib/panel-locale"
import {
  carrierLabel,
  methodZoneSummary,
  tariffKindLabel,
  tariffSummary,
} from "../labels"
import {
  useMethodDelete,
  useMethodMove,
  useMethodVisibility,
} from "../use-method-actions"

// t04-shipping-tariffs: the panel's own /shipping screen, no Admin
// counterpart. The list IS the order the checkout shows the methods in.
//
// t-2026-10-14-01 (panel redesign, G2, prototype states `shipping*`): the list
// after panel-ds E1, E6–E8 and rule 9. `_DataTable` without search or pages
// (the order is the checkout's, and a filtered view would move rows against
// neighbours the owner cannot see); a row opens the method's card. The arrows,
// the switch and the two icons that stood in the row moved into its «…»:
// «Изменить», then «Выше / Ниже в списке» (the whole sequence goes to
// `POST reorder`, as before), then «Скрыть / Показывать» and «Удалить», both
// behind a prompt with the method's name. The state is one `StatusBadge`. The
// default weight is a read section with its own drawer
// (`settings/weight/edit`); its field and «Сохранить» left the page (rule 2).

const columnHelper = createColumnHelper<TenantShippingMethod>()

type MoveProps = {
  index: number
  count: number
  move: (index: number, direction: -1 | 1) => Promise<void>
  isMoving: boolean
}

const MethodRowActions = ({
  method,
  index,
  count,
  move,
  isMoving,
}: { method: TenantShippingMethod } & MoveProps) => {
  const { t } = useTranslation()
  const visibility = useMethodVisibility(method)
  const remove = useMethodDelete(method)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("actions.change"),
              to: `/shipping/${method.id}/edit`,
            },
          ],
        },
        {
          actions: [
            {
              icon: <ArrowLongUp />,
              label: t("shippingMethods.actions.moveUp"),
              disabled: index === 0 || isMoving,
              onClick: () => void move(index, -1),
            },
            {
              icon: <ArrowLongDown />,
              label: t("shippingMethods.actions.moveDown"),
              disabled: index === count - 1 || isMoving,
              onClick: () => void move(index, 1),
            },
          ],
        },
        {
          actions: [
            {
              icon: method.enabled ? <EyeSlash /> : <Eye />,
              label: visibility.label,
              disabled: visibility.isPending,
              onClick: () => void visibility.toggle(),
            },
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

const useColumns = (
  methods: TenantShippingMethod[],
  move: MoveProps["move"],
  isMoving: boolean
) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("shippingMethods.columns.name"),
        cell: ({ row }) => {
          const method = row.original
          const carrier = carrierLabel(t, method.carrier)
          // The carrier and the description stay reachable on hover, never as
          // a second line under the name (table-cells-one-line).
          const title =
            [
              carrier ? t("shippingMethods.carrierTitle", { carrier }) : null,
              method.description,
            ]
              .filter(Boolean)
              .join(" — ") || undefined
          return (
            <Text size="small" leading="compact" weight="plus" className="truncate" title={title}>
              {method.name}
            </Text>
          )
        },
      }),
      columnHelper.display({
        id: "zone",
        header: t("shippingMethods.columns.zone"),
        cell: ({ row }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle truncate">
            {methodZoneSummary(t, row.original)}
          </Text>
        ),
      }),
      columnHelper.display({
        id: "price",
        header: t("shippingMethods.columns.price"),
        cell: ({ row }) => {
          const method = row.original
          const title = [
            tariffKindLabel(t, method.tariff.kind),
            method.tariff_source === "provisioned-default"
              ? t("shippingMethods.provisionedDefault")
              : null,
          ]
            .filter(Boolean)
            .join(" — ")
          return (
            <Text size="small" leading="compact" className="whitespace-nowrap" title={title}>
              {tariffSummary(t, method.tariff, method.currency_code)}
            </Text>
          )
        },
      }),
      columnHelper.accessor("delivery_hint", {
        header: t("shippingMethods.columns.deliveryTime"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="text-ui-fg-subtle truncate">
            {getValue() || "—"}
          </Text>
        ),
      }),
      columnHelper.accessor("enabled", {
        header: t("shippingMethods.columns.state"),
        cell: ({ getValue }) => (
          <StatusBadge color={getValue() ? "green" : "grey"} className="whitespace-nowrap">
            {getValue() ? t("shippingMethods.state.shown") : t("shippingMethods.state.hidden")}
          </StatusBadge>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <MethodRowActions
            method={row.original}
            index={row.index}
            count={methods.length}
            move={move}
            isMoving={isMoving}
          />
        ),
      }),
    ],
    [t, methods.length, move, isMoving]
  )
}

const DefaultWeightSection = ({ grams }: { grams: number }) => {
  const { t } = useTranslation()

  return (
    <SettingsDetailSection
      section={{
        id: "default-weight",
        title: t("shippingMethods.weight.title"),
        description: t("shippingMethods.weight.description"),
        editTo: "settings/weight/edit",
        rows: [
          {
            id: "default-weight-g",
            label: t("shippingMethods.weight.label"),
            value: t("shippingMethods.weight.value", {
              grams: new Intl.NumberFormat(panelLocale()).format(grams),
            }),
          },
        ],
      }}
    />
  )
}

export const ShippingList = () => {
  const { t } = useTranslation()
  const { methods, settings, isPending, isError, error } = useShippingMethods()
  const rows = useMemo(() => methods ?? [], [methods])
  const { move, isPending: isMoving } = useMethodMove(rows)
  const columns = useColumns(rows, move, isMoving)
  const { table } = useDataTable({
    data: rows,
    columns,
    count: rows.length,
    pageSize: Math.max(rows.length, 1),
    enablePagination: false,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  if (isPending || !methods || !settings) {
    return <SingleColumnPageSkeleton sections={2} />
  }

  const hasMethods = methods.length > 0

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={methods} hasOutlet>
      <Container className="divide-y p-0" data-testid="shipping-methods">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("shippingMethods.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("shippingMethods.subtitle")}
            </Text>
          </div>
          <div className="flex shrink-0 items-center gap-x-2">
            <Button size="small" variant="secondary" asChild>
              <Link to="/shipping/zones">{t("shippingMethods.zonesButton")}</Link>
            </Button>
            {hasMethods ? (
              <Button size="small" variant="secondary" asChild>
                <Link to="/shipping/create">{t("shippingMethods.addMethod")}</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {!hasMethods ? (
          <NoRecords
            title={t("shippingMethods.empty.title")}
            message={t("shippingMethods.empty.message")}
            action={{ to: "/shipping/create", label: t("shippingMethods.addMethod") }}
          />
        ) : (
          <_DataTable
            table={table}
            columns={columns}
            count={methods.length}
            pageSize={Math.max(methods.length, 1)}
            pagination={false}
            navigateTo={(row) => `/shipping/${row.original.id}`}
          />
        )}
      </Container>
      <DefaultWeightSection grams={settings.default_weight_g} />
    </SingleColumnPage>
  )
}
