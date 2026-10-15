import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, StatusBadge, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../components/common/action-menu"
import { NoRecords } from "../../../components/common/empty-table-content"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { _DataTable } from "../../../components/table/data-table"
import { useTenantCourses, type TenantCourse } from "../../../hooks/api/courses"
import { useProducts } from "../../../hooks/api/products"
import { useDataTable } from "../../../hooks/use-data-table"
import { productTitleById, STATUS_BADGE_COLOR, STATUS_LABEL_KEY } from "../course-labels"
import { useCourseDelete } from "../use-course-delete"

// o24-courses: the owner's course catalogue.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `courses`,
// `courses-empty`): the list after panel-ds E1, E8 and rule 9. `_DataTable`
// with Курс · Товар · Уроки · Статус · «…»; a row opens the course's card.
// The create form that stood under the table is the «Создать курс» modal on
// its own address, `/courses/create`. A shop has one course per product at
// most, so the list is short: no search and no pages, as on /shipping.

const columnHelper = createColumnHelper<TenantCourse>()

const CourseRowActions = ({ course }: { course: TenantCourse }) => {
  const { t } = useTranslation()
  const remove = useCourseDelete(course, course.lesson_count ?? 0)

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("actions.change"),
              to: `/courses/${course.id}/edit`,
            },
          ],
        },
        {
          actions: [
            {
              icon: <Trash />,
              label: t("courses.card.delete"),
              destructive: true,
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

const useColumns = (titleById: Map<string, string>) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("title", {
        header: t("courses.columns.course"),
        cell: ({ row }) => {
          const course = row.original
          return (
            <Text size="small" leading="compact" weight="plus" className="truncate" title={course.slug}>
              {course.title}
            </Text>
          )
        },
      }),
      columnHelper.display({
        id: "product",
        header: t("courses.columns.product"),
        cell: ({ row }) => {
          const title = titleById.get(row.original.product_id) ?? t("courses.productGone")
          return (
            <Text size="small" leading="compact" className="text-ui-fg-subtle truncate" title={title}>
              {title}
            </Text>
          )
        },
      }),
      columnHelper.accessor("lesson_count", {
        header: t("courses.columns.lessons"),
        cell: ({ getValue }) => (
          <Text size="small" leading="compact" className="tabular-nums">
            {getValue() ?? 0}
          </Text>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("courses.columns.status"),
        cell: ({ getValue }) => (
          <StatusBadge color={STATUS_BADGE_COLOR[getValue()]} className="whitespace-nowrap">
            {t(STATUS_LABEL_KEY[getValue()])}
          </StatusBadge>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <CourseRowActions course={row.original} />,
      }),
    ],
    [t, titleById]
  )
}

export const CourseList = () => {
  const { t } = useTranslation()
  const { courses, isPending, isError, error } = useTenantCourses()
  const { products } = useProducts({ limit: 200, fields: "id,title" })

  const rows = useMemo(() => courses ?? [], [courses])
  const titleById = useMemo(() => productTitleById(products ?? []), [products])
  const columns = useColumns(titleById)
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

  if (isPending || !courses) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const hasCourses = courses.length > 0

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={courses} hasOutlet>
      <Container className="divide-y p-0" data-testid="courses">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h1">{t("courses.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("courses.subtitle")}
            </Text>
          </div>
          {hasCourses ? (
            <Button size="small" variant="secondary" asChild>
              <Link to="/courses/create" data-testid="course-create">
                {t("courses.create")}
              </Link>
            </Button>
          ) : null}
        </div>

        {!hasCourses ? (
          // The shared NoRecords has no side padding and leaves the message
          // left-aligned once it wraps (390 wide): this list gives it both,
          // and grows past the fixed 150 px instead of cropping (lead, 15.10).
          <NoRecords
            title={t("courses.empty.title")}
            message={t("courses.empty.message")}
            action={{ to: "/courses/create", label: t("courses.create") }}
            className="h-auto px-6 py-10 text-center"
          />
        ) : (
          <_DataTable
            table={table}
            columns={columns}
            count={courses.length}
            pageSize={Math.max(courses.length, 1)}
            pagination={false}
            navigateTo={(row) => `/courses/${row.original.id}`}
          />
        )}
      </Container>
    </SingleColumnPage>
  )
}
