import { useMemo, useState } from "react"
import { Plus } from "@medusajs/icons"
import { Button, Container, Heading, Input, Select, StatusBadge, Table, Text } from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { TableScroll } from "../../../components/table/table-scroll"
import { useDomains } from "../../../hooks/api/domains"
import {
  TenantArticle,
  useTenantArticleCategories,
  useTenantArticles,
} from "../../../hooks/api/articles"
import {
  DEFAULT_ARTICLE_LOCALE,
  formatArticleDate,
  localeLabel,
  statusBadge,
} from "../article-locales"
import { ArticleRowActions } from "./article-row-actions"

// t10-blog: the shop's journal. The panel's own screen, no Admin counterpart,
// built from the same primitives the pages screen uses (SingleColumnPage,
// Container, Heading, Table, StatusBadge) so it sits in the Admin's shell
// unchanged.
//
// One ROW per article, not per row of the table `GET /tenants/articles`
// returns: that endpoint answers one row per language, and an owner thinks of
// «the article about peptides», with Russian and English as its two texts.
//
// b18-blog-full changed the top of this screen. The create form used to live at
// the BOTTOM and its first field asked for a URL slug, which is what Ivan found
// on the live panel («странный функционал с указанием адреса статей, с
// отсутствием страниц на которые бы можно было бы добавить сами статьи»,
// 2026-09-16 08:31). It is now one «Новая статья» button opening a whole
// editor screen, and the list grew the three controls a journal with more than
// a handful of articles needs: search, a status filter and a rubric filter.

const publicArticleUrl = (host: string | undefined, slug: string) =>
  host ? `${host}/journal/${slug}` : `/journal/${slug}`

export type ArticleGroup = {
  slug: string
  /** The row shown in the table: the owner's default language, else the first. */
  primary: TenantArticle
  locales: TenantArticle[]
}

/** Groups the flat locale rows into articles, newest first. */
export const groupArticles = (rows: TenantArticle[]): ArticleGroup[] => {
  const bySlug = new Map<string, TenantArticle[]>()
  for (const row of rows) {
    const group = bySlug.get(row.slug) ?? []
    group.push(row)
    bySlug.set(row.slug, group)
  }

  return [...bySlug.entries()]
    .map(([slug, locales]) => {
      const sorted = [...locales].sort((a, b) => a.locale.localeCompare(b.locale))
      const primary =
        sorted.find((row) => row.locale === "ru") ??
        sorted.find((row) => row.locale === DEFAULT_ARTICLE_LOCALE) ??
        sorted[0]
      return { slug, primary, locales: sorted }
    })
    .sort((a, b) => {
      const dateA = a.primary.published_at ? Date.parse(a.primary.published_at) : -Infinity
      const dateB = b.primary.published_at ? Date.parse(b.primary.published_at) : -Infinity
      if (dateA !== dateB) return dateB - dateA
      return a.slug.localeCompare(b.slug)
    })
}

/**
 * Search runs over what an owner can SEE of an article — its title, its
 * address, its excerpt and its rubric, in every language it has — rather than
 * over the body: a hit deep inside a 12 000-character text that the row cannot
 * show reads as a false positive.
 */
export const matchesQuery = (group: ArticleGroup, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return group.locales.some((row) =>
    [row.title, row.slug, row.excerpt ?? "", row.category ?? "", ...row.tags]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  )
}

/** The status filter works on the ARTICLE: a row matches if any language does. */
export const matchesStatus = (group: ArticleGroup, status: string): boolean =>
  status === "all" || group.locales.some((row) => row.status === status)

export const matchesCategory = (group: ArticleGroup, category: string): boolean =>
  category === "all" || group.locales.some((row) => (row.category ?? "") === category)

const STATUS_FILTERS = [
  { value: "all", label: "Все статусы" },
  { value: "published", label: "Опубликованные" },
  { value: "draft", label: "Черновики" },
  { value: "scheduled", label: "По расписанию" },
]

export const ArticleList = () => {
  const navigate = useNavigate()
  const { articles, isPending, isError, error } = useTenantArticles()
  const { categories } = useTenantArticleCategories()
  const { primary_host: primaryHost } = useDomains()

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [category, setCategory] = useState("all")

  const groups = useMemo(() => groupArticles(articles ?? []), [articles])
  const visible = useMemo(
    () =>
      groups
        .filter((group) => matchesQuery(group, query))
        .filter((group) => matchesStatus(group, status))
        .filter((group) => matchesCategory(group, category)),
    [groups, query, status, category]
  )

  if (isError) {
    throw error
  }

  if (isPending || !articles) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const filtering = query.trim() !== "" || status !== "all" || category !== "all"

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={articles}>
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h2">Журнал</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Статьи магазина: их читают покупатели и по ним магазин находят в
              поиске. Опубликованная статья появляется в ленте
              <span className="font-mono"> /journal</span> и в карте сайта. У одной
              статьи может быть текст на нескольких языках — посетителю
              показывается его язык, а если такого текста нет, любой другой.
            </Text>
          </div>
          <Button size="small" onClick={() => navigate("new")} data-testid="article-new">
            <Plus /> Новая статья
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по заголовку, адресу, рубрике"
            className="w-[320px]"
            data-testid="article-search"
          />
          <Select value={status} onValueChange={setStatus}>
            <Select.Trigger className="w-[200px]" data-testid="article-status-filter">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {STATUS_FILTERS.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          {categories && categories.length > 0 ? (
            <Select value={category} onValueChange={setCategory}>
              <Select.Trigger className="w-[220px]" data-testid="article-category-filter">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">Все рубрики</Select.Item>
                {categories.map((option) => (
                  <Select.Item key={option.category} value={option.category}>
                    {option.category} · {option.count}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          ) : null}
          <Text size="small" className="text-ui-fg-muted">
            {/* A count, not «найдено»: the number is the answer (rule 18e). */}
            {visible.length} из {groups.length}
          </Text>
        </div>

        <TableScroll>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Статья</Table.HeaderCell>
                <Table.HeaderCell>Статус</Table.HeaderCell>
                <Table.HeaderCell>Рубрика</Table.HeaderCell>
                <Table.HeaderCell>Языки</Table.HeaderCell>
                <Table.HeaderCell>Дата</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visible.length === 0 ? (
                <Table.Row>
                  {/* `Table.Cell` of @medusajs/ui takes no colSpan, so the empty
                      state fills the first cell and the rest stay blank. */}
                  <Table.Cell>
                    <Text size="small" className="text-ui-fg-subtle" data-testid="article-empty">
                      {filtering
                        ? "Под фильтр ничего не подошло. Снимите его, чтобы увидеть все статьи."
                        : "Статей пока нет. Нажмите «Новая статья» — откроется страница, где можно сразу писать."}
                    </Text>
                  </Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>
              ) : null}
              {visible.map((group) => {
                const badge = statusBadge(group.primary)
                return (
                  <Table.Row key={group.slug} data-testid="article-row">
                    <Table.Cell>
                      <Link
                        to={group.slug}
                        className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                      >
                        <Text
                          size="small"
                          weight="plus"
                          className="truncate"
                          title={publicArticleUrl(primaryHost, group.slug)}
                        >
                          {group.primary.title.trim() || group.slug}
                        </Text>
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={badge.color}>{badge.label}</StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text
                        size="small"
                        className="text-ui-fg-subtle truncate"
                        title={group.primary.category || "—"}
                      >
                        {group.primary.category || "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap items-center gap-1">
                        {group.locales.map((row) => (
                          <StatusBadge key={row.locale} color={row.published ? "green" : "orange"}>
                            {localeLabel(row.locale)}
                          </StatusBadge>
                        ))}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle">
                        {formatArticleDate(group.primary.published_at) || "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <ArticleRowActions group={group} publicHost={primaryHost} />
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </TableScroll>
      </Container>
    </SingleColumnPage>
  )
}
