import { useState } from "react"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"

import { SingleColumnPage } from "../../../components/layout/pages"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useDomains } from "../../../hooks/api/domains"
import { TenantArticle, useCreateTenantArticle, useTenantArticles } from "../../../hooks/api/articles"
import { ARTICLE_LOCALES, DEFAULT_ARTICLE_LOCALE, formatArticleDate, localeLabel } from "../article-locales"
import { ArticleRowActions } from "./article-row-actions"

// t10-blog: the shop's journal. The panel's own screen, no Admin counterpart,
// built from the same primitives the pages screen uses (SingleColumnPage,
// Container, Heading, Table, StatusBadge) so it sits in the Admin's shell
// unchanged.
//
// One ROW per article, not per row of the table `GET /tenants/articles`
// returns: that endpoint answers one row per language, and an owner thinks of
// «the article about peptides», with Russian and English as its two texts.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

export const ArticleList = () => {
  const navigate = useNavigate()
  const { articles, isPending, isError, error } = useTenantArticles()
  const { primary_host: primaryHost } = useDomains()

  const [slug, setSlug] = useState("")
  const [title, setTitle] = useState("")
  const [locale, setLocale] = useState<string>("ru")
  const { mutateAsync: createArticle, isPending: isCreating } = useCreateTenantArticle()

  if (isError) {
    throw error
  }

  if (isPending || !articles) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  const groups = groupArticles(articles)

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = slug.trim().toLowerCase()
    const titleValue = title.trim()

    if (!SLUG_PATTERN.test(value) || value.length < 2 || value.length > 96) {
      toast.error(
        "Адрес статьи: строчные латинские буквы, цифры и дефисы, от 2 до 96 символов."
      )
      return
    }

    if (!titleValue) {
      toast.error("Укажите заголовок статьи.")
      return
    }

    await createArticle(
      { slug: value, locale, title: titleValue },
      {
        onSuccess: () => {
          setSlug("")
          setTitle("")
          toast.success("Статья создана")
          navigate(value)
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={articles}>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Журнал</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Статьи магазина: их читают покупатели и по ним магазин находят в
            поиске. Опубликованная статья появляется в ленте
            <span className="font-mono"> /journal</span> и в карте сайта. У одной
            статьи может быть текст на нескольких языках — посетителю
            показывается его язык, а если такого текста нет, любой другой.
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Статья</Table.HeaderCell>
              <Table.HeaderCell>Публичный адрес</Table.HeaderCell>
              <Table.HeaderCell>Языки</Table.HeaderCell>
              <Table.HeaderCell>Дата</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {groups.length === 0 ? (
              <Table.Row>
                {/* `Table.Cell` of @medusajs/ui takes no colSpan, so the empty
                    state fills the first cell and the rest stay blank. */}
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    Статей пока нет. Создайте первую — форма ниже.
                  </Text>
                </Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : null}
            {groups.map((group) => (
              <Table.Row key={group.slug}>
                <Table.Cell>
                  <Link
                    to={group.slug}
                    className="text-ui-fg-base hover:text-ui-fg-subtle transition-fg"
                  >
                    <Text size="small" weight="plus">
                      {group.primary.title.trim() || group.slug}
                    </Text>
                  </Link>
                  {group.primary.excerpt ? (
                    <Text size="small" className="text-ui-fg-subtle line-clamp-1">
                      {group.primary.excerpt}
                    </Text>
                  ) : null}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle font-mono">
                    {publicArticleUrl(primaryHost, group.slug)}
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
                  <ArticleRowActions group={group} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-end gap-x-3 gap-y-2 px-6 py-4"
        >
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Адрес статьи
            </Text>
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="peptidy-havinsona-vvedenie"
              className="font-mono w-[280px]"
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Язык
            </Text>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-ui-fg-base txt-compact-small"
            >
              {ARTICLE_LOCALES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              Заголовок
            </Text>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Пептиды Хавинсона: что это и как работают"
              className="w-[360px]"
            />
          </div>
          <Button size="small" type="submit" isLoading={isCreating}>
            <Plus /> Новая статья
          </Button>
        </form>
      </Container>
    </SingleColumnPage>
  )
}
