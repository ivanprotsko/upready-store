import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { useCreateTenantArticle } from "../../../hooks/api/articles"
import { useDomains } from "../../../hooks/api/domains"
import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import { localeLabel } from "../article-locales"
import { ArticleEditor } from "../components/article-editor"
import { EMPTY_ARTICLE, type ArticleFormValues, articleBody, articleSchema } from "../components/article-form"

/**
 * «Новая статья» — the screen that did not exist (b18-blog-full).
 *
 * Ivan, 2026-09-16 08:31: «странный функционал с указанием адреса статей, с
 * отсутствием страниц на которые бы можно было бы добавить сами статьи». The
 * journal's only entry point was a strip of three inputs at the bottom of the
 * list whose FIRST field asked for a URL slug. This screen is the whole
 * article — title first, address derived from it — and one save, through
 * `POST /tenants/articles`, which accepts the whole body.
 *
 * The language it writes is the shop's own `default_locale`, not a literal
 * `en`: a Russian shop's owner must not have to know the panel had a default
 * (the t11 lesson, `upready-store-t11-seo-locale-fallback-and-cache-trap`).
 *
 * t-2026-10-14-01 (panel redesign, G4): the same editor as an existing
 * article's, three tabs (`../components/article-editor.tsx`). The language
 * stands in the header, fixed: other languages are added after the save.
 */

export const ArticleNew = () => (
  <RouteFocusModal>
    <NewArticleForm />
  </RouteFocusModal>
)

/**
 * Inside the modal on purpose: `useRouteModal` only exists under
 * `RouteFocusModal`'s own provider, and it is what releases the «unsaved
 * changes» guard on a successful save. Navigating with a bare `navigate`
 * instead left the owner confirming that she wanted to leave a form she had
 * just saved — measured on the stand, accept round 1, and it blocked the whole
 * create flow.
 */
const NewArticleForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()
  const { primary_host: primaryHost } = useDomains()
  const { mutateAsync: createArticle, isPending } = useCreateTenantArticle()

  const schema = useMemo(() => articleSchema(t), [t])
  const form = useForm<ArticleFormValues>({
    defaultValues: EMPTY_ARTICLE,
    resolver: zodResolver(schema),
  })

  // `locale_settings` is null for a shop that never opened the locale screen,
  // which is «not saved yet», not «English»: Russian, the language this
  // platform's shops are written in.
  const locale = localeSettings?.default_locale ?? "ru"

  const handleSubmit = async (values: ArticleFormValues) => {
    await createArticle(
      {
        slug: values.slug,
        locale,
        title: values.title.trim() || values.slug,
        ...articleBody(values),
      },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: (data) => {
          toast.success(
            values.status === "published" ? t("journal.toast.published") : t("journal.toast.saved")
          )
          // Straight into the editor of the article just written, so the next
          // thing the owner does — add a language, fix a typo — is one click.
          handleSuccess(`/journal/${data.article.slug}`)
        },
      }
    )
  }

  return (
    <ArticleEditor
      form={form}
      onSubmit={handleSubmit}
      isPending={isPending}
      name={t("journal.editor.newTitle")}
      host={primaryHost}
      autoSlug
      aside={
        <Button
          size="small"
          variant="secondary"
          type="button"
          disabled
          title={t("journal.editor.newLanguageHint")}
          data-testid="article-language"
        >
          {localeLabel(locale)}
        </Button>
      }
    />
  )
}
