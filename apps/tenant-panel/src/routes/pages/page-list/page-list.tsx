import { useState } from "react"
import { Plus } from "@medusajs/icons"
import { Button, Container, Heading, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useDomains } from "../../../hooks/api/domains"
import { useCreateTenantPage, useTenantPages } from "../../../hooks/api/pages"
import {
  PAGE_SECTIONS,
  STATUS_COLOR,
  STATUS_LABEL,
  sectionOf,
  statusOf,
} from "../page-sections"
import { CustomPageRow } from "./custom-page-row"
import { PHONE_CARDS } from "../../../components/table/phone-cards"

// tenant-panel wave 2, piece 7: the panel's own screen, no Admin counterpart
// (the native Admin has no per-store content pages). Built from the same
// primitives the copied screens use — SingleColumnPage, Container, Heading,
// Table, StatusBadge — so it sits in the Admin's shell unchanged.
//
// t05-page-keys (2026-09-16): the fixed five rows became "the reserved five,
// plus whatever the owner created" — a create form at the bottom, and a
// `CustomPageRow` per own page carrying the delete button and the footer
// reorder buttons the five never needed (they cannot be deleted, and their
// footer order was fixed before this task).

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const publicPageUrl = (host: string | undefined, key: string) =>
  host ? `${host}/pages/${key}` : `/pages/${key}`

export const PageList = () => {
  const navigate = useNavigate()
  const { pages, isPending, isError, error } = useTenantPages()
  const { primary_host: primaryHost } = useDomains()

  const [slug, setSlug] = useState("")
  const [title, setTitle] = useState("")
  const { mutateAsync: createPage, isPending: isCreating } = useCreateTenantPage()

  if (isError) {
    throw error
  }

  if (isPending || !pages) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const byKey = new Map(pages.map((page) => [page.key, page]))
  const customPages = pages.filter((page) => !page.reserved)
  const footerPages = pages
    .filter((page) => page.in_footer)
    .sort((a, b) => {
      const orderA = a.footer_order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.footer_order ?? Number.MAX_SAFE_INTEGER
      return orderA !== orderB ? orderA - orderB : a.title.localeCompare(b.title)
    })

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = slug.trim().toLowerCase()
    const titleValue = title.trim()

    if (!SLUG_PATTERN.test(value) || value.length < 2 || value.length > 48) {
      toast.error(
        "Адрес страницы: строчные латинские буквы, цифры и дефисы, от 2 до 48 символов."
      )
      return
    }

    if (!titleValue) {
      toast.error("Укажите заголовок страницы.")
      return
    }

    await createPage(
      { slug: value, title: titleValue },
      {
        onSuccess: (data) => {
          setSlug("")
          setTitle("")
          toast.success("Страница создана")
          navigate(data.page.key)
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={pages}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Страницы</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Пять готовых разделов и любые свои страницы — доставка, FAQ,
            условия оптовой продажи и что угодно ещё. Опубликованная страница,
            отмеченная «в подвале», появляется в подвале магазина, в блоке
            «Информация», в выбранном вами порядке.
          </Text>
        </div>
        <div className={PHONE_CARDS}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Страница</Table.HeaderCell>
                <Table.HeaderCell>Публичный адрес</Table.HeaderCell>
                <Table.HeaderCell>Статус</Table.HeaderCell>
                <Table.HeaderCell>В подвале</Table.HeaderCell>
                <Table.HeaderCell />
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
                        {publicPageUrl(primaryHost, section.key)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={STATUS_COLOR[status]}>
                        {STATUS_LABEL[status]}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle">
                        <span className="md:hidden">В подвале: </span>
                        {page?.in_footer ? "Да" : "Нет"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell />
                  </Table.Row>
                )
              })}
              {customPages.map((page) => {
                const footerIndex = footerPages.findIndex((entry) => entry.key === page.key)
                return (
                  <CustomPageRow
                    key={page.key}
                    page={page}
                    publicUrl={publicPageUrl(primaryHost, page.key)}
                    neighbourUp={footerIndex > 0 ? footerPages[footerIndex - 1] : undefined}
                    neighbourDown={
                      footerIndex >= 0 && footerIndex < footerPages.length - 1
                        ? footerPages[footerIndex + 1]
                        : undefined
                    }
                  />
                )
              })}
            </Table.Body>
          </Table>
        </div>
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-x-3 gap-y-2 px-6 py-4"
        >
          <div className="flex flex-col gap-y-1 max-md:w-full">
            <Text size="small" className="text-ui-fg-subtle">
              Адрес страницы
            </Text>
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="delivery"
              className="font-mono w-[200px] max-md:w-full"
            />
          </div>
          <div className="flex flex-col gap-y-1 max-md:w-full">
            <Text size="small" className="text-ui-fg-subtle">
              Заголовок
            </Text>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Доставка"
              className="w-[280px] max-md:w-full"
            />
          </div>
          <Button size="small" type="submit" isLoading={isCreating}>
            <Plus /> Новая страница
          </Button>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
