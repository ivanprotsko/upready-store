import { useState } from "react"
import { Button, Heading, Text, toast } from "@medusajs/ui"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useCreateTenantArticle, useTenantArticle } from "../../../hooks/api/articles"
import { useDomains } from "../../../hooks/api/domains"
import { ARTICLE_LOCALES, localeLabel } from "../article-locales"
import { EditArticleForm } from "./components/edit-article-form/edit-article-form"

// t10-blog: the panel's own edit screen. A focus modal rather than a drawer,
// for the same reason the pages screen is one — the body is a long markdown
// document and a 440 px drawer is the wrong shape to write an article in.
//
// An article has one text PER LANGUAGE, so this screen edits one language at a
// time and switches between them with the row of buttons at the top. The
// language a shop has not written yet is offered as «add», which is a
// `POST /tenants/articles` with the same slug.

export const ArticleEdit = () => {
  const { slug = "" } = useParams()
  const { primary_host: primaryHost } = useDomains()
  const { articles, isPending, isError, error } = useTenantArticle(slug)
  const { mutateAsync: createLocale, isPending: isAdding } = useCreateTenantArticle()
  const [activeLocale, setActiveLocale] = useState<string | null>(null)

  if (isError) {
    throw error
  }

  const rows = articles ?? []
  const current =
    rows.find((row) => row.locale === activeLocale) ??
    rows.find((row) => row.locale === "ru") ??
    rows[0]

  const missingLocales = ARTICLE_LOCALES.filter(
    (option) => !rows.some((row) => row.locale === option.value)
  )

  const handleAddLocale = async (locale: string) => {
    await createLocale(
      { slug, locale, title: current?.title ?? slug },
      {
        onSuccess: () => {
          setActiveLocale(locale)
          toast.success(`Добавлен текст на языке «${localeLabel(locale)}»`)
        },
        onError: (addError) => toast.error(addError.message),
      }
    )
  }

  return (
    <RouteFocusModal>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{current?.title?.trim() || slug}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle font-mono">
              /journal/{slug}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>

      {!isPending && current ? (
        <>
          {(rows.length > 1 || missingLocales.length > 0) && (
            <div className="border-ui-border-base flex flex-wrap items-center gap-2 border-b px-6 py-3">
              <Text size="small" className="text-ui-fg-subtle">
                Язык текста:
              </Text>
              {rows.map((row) => (
                <Button
                  key={row.locale}
                  size="small"
                  variant={row.locale === current.locale ? "primary" : "secondary"}
                  onClick={() => setActiveLocale(row.locale)}
                  type="button"
                >
                  {localeLabel(row.locale)}
                  {row.published ? "" : " · черновик"}
                </Button>
              ))}
              {missingLocales.slice(0, 3).map((option) => (
                <Button
                  key={option.value}
                  size="small"
                  variant="transparent"
                  isLoading={isAdding}
                  onClick={() => handleAddLocale(option.value)}
                  type="button"
                >
                  + {option.label}
                </Button>
              ))}
            </div>
          )}
          <EditArticleForm
            key={current.id}
            slug={slug}
            article={current}
            publicHost={primaryHost}
          />
        </>
      ) : null}
    </RouteFocusModal>
  )
}
