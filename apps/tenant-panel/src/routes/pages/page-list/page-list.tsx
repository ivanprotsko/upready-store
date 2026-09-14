import { Container, Heading, StatusBadge, Table, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useTenantPages } from "../../../hooks/api/pages"
import {
  PAGE_SECTIONS,
  STATUS_COLOR,
  STATUS_LABEL,
  sectionOf,
  statusOf,
} from "../page-sections"

// tenant-panel wave 2, piece 7: the panel's own screen, no Admin counterpart
// (the native Admin has no per-store content pages). Built from the same
// primitives the copied screens use — SingleColumnPage, Container, Heading,
// Table, StatusBadge — so it sits in the Admin's shell unchanged.
//
// A plain `Table` rather than the copied `DataTable`: the list is five fixed
// rows with no server-side filtering, sorting or pagination, and DataTable's
// whole surface is those three things.

export const PageList = () => {
  const { pages, isPending, isError, error } = useTenantPages()

  if (isError) {
    throw error
  }

  if (isPending || !pages) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const byKey = new Map(pages.map((page) => [page.key, page]))

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={pages}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Страницы</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Пять страниц, которые может показывать ваш магазин. Опубликованная
            страница появляется в подвале магазина, в блоке «Информация».
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Страница</Table.HeaderCell>
              <Table.HeaderCell>Адрес</Table.HeaderCell>
              <Table.HeaderCell>Статус</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {PAGE_SECTIONS.map((section) => {
              const page = byKey.get(section.key)
              const status = page ? statusOf(page) : "empty"

              return (
                <Table.Row key={section.key}>
                  <Table.Cell>
                    <Link
                      to={section.key}
                      className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                    >
                      <Text size="small" weight="plus">
                        {page?.title?.trim() ||
                          sectionOf(section.key)?.label ||
                          section.key}
                      </Text>
                    </Link>
                    <Text size="small" className="text-ui-fg-subtle">
                      {section.hint}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small" className="text-ui-fg-subtle font-mono">
                      /pages/{section.key}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={STATUS_COLOR[status]}>
                      {STATUS_LABEL[status]}
                    </StatusBadge>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      </Container>
    </SingleColumnPage>
  )
}
