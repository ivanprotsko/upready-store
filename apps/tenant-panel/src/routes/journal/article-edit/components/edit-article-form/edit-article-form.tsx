import { type ReactNode, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { StatusBadge, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { useRouteModal } from "../../../../../components/modals"
import { TenantArticle, useUpdateTenantArticle } from "../../../../../hooks/api/articles"
import { useDomains } from "../../../../../hooks/api/domains"
import { STATUS_COLOR, shownStatus } from "../../../article-locales"
import { ArticleEditor } from "../../../components/article-editor"
import { type ArticleFormValues, articleBody, articleSchema, articleValues } from "../../../components/article-form"

// t10-blog wrote this form; b18-blog-full moved every field into one module
// shared with «Новая статья», so the two screens cannot drift (rule 20). What
// stays here is what only the EDIT screen has: the article already exists, so
// the save is a `PUT`, and the address can be RENAMED — which moves every
// language row of the article at once and is why the form navigates to the
// new address on success.
//
// t-2026-10-14-01 (panel redesign, G4): the fields are the three tabs of
// `ArticleEditor`; the header carries the language menu and the status.

type EditArticleFormProps = {
  slug: string
  article: TenantArticle
  /** The language menu of the header. */
  language: ReactNode
}

export const EditArticleForm = ({ slug, article, language }: EditArticleFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { primary_host: primaryHost } = useDomains()

  const schema = useMemo(() => articleSchema(t), [t])
  const form = useForm<ArticleFormValues>({
    defaultValues: articleValues(article),
    resolver: zodResolver(schema),
  })

  const { mutateAsync, isPending } = useUpdateTenantArticle(slug)

  const handleSubmit = async (values: ArticleFormValues) => {
    const renamed = values.slug !== article.slug

    await mutateAsync(
      {
        locale: article.locale,
        title: values.title,
        ...(renamed && { slug: values.slug }),
        ...articleBody(values),
      },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          toast.success(
            renamed ? t("journal.toast.renamed", { slug: values.slug }) : t("journal.toast.saved")
          )
          // A rename leaves the URL this modal is mounted on naming nothing,
          // so it goes to the NEW address. Through `handleSuccess` either way:
          // a bare `navigate` skips the modal's own «unsaved changes» release
          // and the owner is asked to confirm leaving a form she just saved
          // (measured on the stand, accept round 1).
          handleSuccess(renamed ? `/journal/${values.slug}` : undefined)
        },
      }
    )
  }

  const status = shownStatus(article)

  return (
    <ArticleEditor
      form={form}
      onSubmit={handleSubmit}
      isPending={isPending}
      name={article.title.trim() || slug}
      host={primaryHost}
      href={primaryHost && article.published ? `https://${primaryHost}/journal/${article.slug}` : undefined}
      aside={
        <>
          {language}
          <StatusBadge color={STATUS_COLOR[status]} className="whitespace-nowrap max-md:hidden">
            {t(`journal.status.${status}`)}
          </StatusBadge>
        </>
      }
    />
  )
}
