import { useState } from "react"
import { toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useCreateTenantArticle, useTenantArticle } from "../../../hooks/api/articles"
import { ARTICLE_LOCALES, localeLabel } from "../article-locales"
import { EditArticleForm } from "./components/edit-article-form/edit-article-form"
import { LanguageMenu } from "./components/language-menu"

// t10-blog: the panel's own edit screen. A focus modal rather than a drawer,
// for the same reason the pages screen is one — the body is a long markdown
// document and a 440 px drawer is the wrong shape to write an article in.
//
// An article has one text PER LANGUAGE, so this screen edits one language at a
// time. The language a shop has not written yet is offered as «add», which is
// a `POST /tenants/articles` with the same slug.
//
// t-2026-10-14-01 (panel redesign, G4): the languages moved from a row of
// buttons over the form into the header's menu (`language-menu.tsx`), next to
// the tabs of the editor.

export const ArticleEdit = () => {
  const { t } = useTranslation()
  const { slug = "" } = useParams()
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

  const missing = ARTICLE_LOCALES.filter((locale) => !rows.some((row) => row.locale === locale))

  const handleAddLocale = async (locale: string) => {
    await createLocale(
      { slug, locale, title: current?.title ?? slug },
      {
        onSuccess: () => {
          setActiveLocale(locale)
          toast.success(t("journal.toast.localeAdded", { locale: localeLabel(locale) }))
        },
        onError: (addError) => toast.error(addError.message),
      }
    )
  }

  return (
    <RouteFocusModal>
      {!isPending && current ? (
        <EditArticleForm
          key={current.id}
          slug={slug}
          article={current}
          language={
            <LanguageMenu
              current={current.locale}
              locales={rows.map((row) => row.locale)}
              missing={missing}
              isAdding={isAdding}
              onSwitch={setActiveLocale}
              onAdd={handleAddLocale}
            />
          }
        />
      ) : (
        <RouteFocusModal.Header>
          <RouteFocusModal.Title asChild>
            <span className="sr-only">{slug}</span>
          </RouteFocusModal.Title>
        </RouteFocusModal.Header>
      )}
    </RouteFocusModal>
  )
}
