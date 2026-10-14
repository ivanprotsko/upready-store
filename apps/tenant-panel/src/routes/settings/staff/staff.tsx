import { Badge, Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useStaff } from "../../../hooks/api/staff"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import { StaffMember, staffName, staffRoleColor, staffRoleOf } from "../../../lib/staff"
import { StaffRowActions } from "./staff-actions"

// t-2026-10-07-11: «Сотрудники» — the owner creates the staff's logins in the
// panel and gives each a role (Ivan 2026-10-07: «Ролей нет: каждый логин
// видит весь магазин. Это нужно исправить»).
//
// t-2026-10-14-41: the role is a badge with one colour per role
// (`staffRoleColor`, panel-ds E7). The platform's developer stands apart and
// its row offers neither «edit» nor «delete»: only the platform changes it.
//
// t-2026-10-14-01 (panel redesign, G2, prototype «G2 · Список и карточка»):
// the list after panel-ds E1 — `Container` with the heading and its one
// button, under it `_DataTable`. A row opens the card `/settings/staff/:id`;
// the pencil and the bin left the row for its «…». The add form is the
// drawer of the nested route `create`, drawn into this page's outlet. There
// is no empty state: the owner is always in the list.

const columnHelper = createColumnHelper<StaffMember>()

const useColumns = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  return useMemo(
    () => [
      columnHelper.display({
        id: "name",
        header: t("staff.columns.name"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-x-2">
            <Text size="small" leading="compact" className="truncate">
              {staffName(row.original) || "—"}
            </Text>
            {row.original.is_self ? <Badge size="2xsmall">{t("staff.you")}</Badge> : null}
          </div>
        ),
      }),
      columnHelper.accessor("email", {
        header: t("staff.columns.email"),
        cell: ({ getValue }) => <span className="truncate">{getValue()}</span>,
      }),
      columnHelper.accessor("role", {
        header: t("staff.columns.role"),
        meta: { phoneTop: "end" },
        cell: ({ row }) => {
          const member = row.original
          const role = staffRoleOf(member)
          return (
            <StatusBadge color={staffRoleColor(member.role)} data-testid="staff-role-badge">
              {role ? t(`staff.roles.${role}`) : member.role}
            </StatusBadge>
          )
        },
      }),
      columnHelper.accessor("created_at", {
        header: t("staff.columns.created"),
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{getFullDate({ date: getValue() })}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <StaffRowActions member={row.original} />,
      }),
    ],
    [t, getFullDate]
  )
}

export const Staff = () => {
  const { t } = useTranslation()
  const { staff, isPending, isError, error } = useStaff()
  const columns = useColumns()

  const { table } = useDataTable({
    data: staff ?? [],
    columns,
    count: staff?.length ?? 0,
    enablePagination: false,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  if (isPending || !staff) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <Container className="divide-y p-0" data-testid="staff">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("staff.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("staff.subtitle")}
            </Text>
          </div>
          <Link to="/settings/staff/create">
            <Button size="small" variant="secondary">
              {t("staff.add")}
            </Button>
          </Link>
        </div>
        <_DataTable
          table={table}
          columns={columns}
          count={staff.length}
          pageSize={Math.max(1, staff.length)}
          pagination={false}
          navigateTo={(row) => `/settings/staff/${row.original.id}`}
        />
      </Container>
    </SingleColumnPage>
  )
}
