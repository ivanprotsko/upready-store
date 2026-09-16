import { Button, Text, toast } from "@medusajs/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { RouteFocusModal, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { TenantArticle, useUpdateTenantArticle } from "../../../../../hooks/api/articles"
import {
  ArticleFields,
  ArticleFormSchema,
  type ArticleFormValues,
} from "../../../components/article-fields"
import { fromDateTimeInput, localeLabel, toDateTimeInput } from "../../../article-locales"

// t10-blog wrote this form; b18-blog-full moved every field into
// `../../../components/article-fields`, shared with «Новая статья», so the two
// screens cannot drift (rule 20). What stays here is what only the EDIT screen
// has: the article already exists, so the save is a `PUT`, and the address can
// be RENAMED — which moves every language row of the article at once and is
// why the form navigates to the new address on success.

type EditArticleFormProps = {
  slug: string
  article: TenantArticle
  /** Host of the shop, for the «открыть на сайте» link and the address hint. */
  publicHost?: string
}

export const EditArticleForm = ({ slug, article, publicHost }: EditArticleFormProps) => {
  const { handleSuccess } = useRouteModal()

  const form = useForm<ArticleFormValues>({
    defaultValues: {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt ?? "",
      cover_url: article.cover_url ?? "",
      body: article.body,
      category: article.category ?? "",
      author: article.author ?? "",
      tags: article.tags.join(", "),
      status: article.status,
      published_at: toDateTimeInput(article.published_at),
      seo_title: article.seo_title ?? "",
      seo_description: article.seo_description ?? "",
    },
    resolver: zodResolver(ArticleFormSchema),
  })

  const { mutateAsync, isPending } = useUpdateTenantArticle(slug)

  const handleSubmit = form.handleSubmit(async (values) => {
    const renamed = values.slug !== article.slug

    await mutateAsync(
      {
        locale: article.locale,
        title: values.title,
        body: values.body,
        ...(renamed && { slug: values.slug }),
        status: values.status,
        excerpt: values.excerpt.trim() || null,
        cover_url: values.cover_url.trim() || null,
        // An empty field means "not stamped yet", not "clear the date": the
        // route stamps it on first publish only when the key is OMITTED, and
        // reads an explicit `null` as "erase the date" (t10-blog, accept
        // round 1) — a blank input owner never asked to erase anything.
        published_at: fromDateTimeInput(values.published_at) ?? undefined,
        category: values.category.trim() || null,
        author: values.author.trim() || null,
        tags: values.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        seo_title: values.seo_title.trim() || null,
        seo_description: values.seo_description.trim() || null,
      },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          toast.success(
            renamed ? `Статья сохранена, новый адрес /journal/${values.slug}` : "Статья сохранена"
          )
          // A rename leaves the URL this modal is mounted on naming nothing,
          // so it goes to the NEW address. Through `handleSuccess` either way:
          // a bare `navigate` skips the modal's own «unsaved changes» release
          // and the owner is asked to confirm leaving a form she just saved
          // (measured on the stand, accept round 1 — the dialog blocked the
          // whole create flow).
          handleSuccess(renamed ? `/journal/${values.slug}` : undefined)
        },
      }
    )
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-10">
          <div className="flex w-full max-w-[1100px] flex-col gap-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" className="text-ui-fg-subtle">
                Текст на языке «{localeLabel(article.locale)}». Другие языки этой статьи
                редактируются отдельно — переключатель вверху.
              </Text>
              {article.published && publicHost ? (
                <a
                  href={`${publicHost}/journal/${article.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ui-fg-interactive txt-compact-small underline"
                  data-testid="article-open-on-site"
                >
                  Открыть на сайте ↗
                </a>
              ) : null}
            </div>

            <ArticleFields form={form} publicUrl={publicHost} />
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                Отмена
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="article-save">
              Сохранить
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
