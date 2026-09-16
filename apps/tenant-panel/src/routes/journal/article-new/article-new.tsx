import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import { useCreateTenantArticle } from "../../../hooks/api/articles"
import { useDomains } from "../../../hooks/api/domains"
import { useTenantLocaleSettings } from "../../../hooks/api/locale-settings"
import {
  ArticleFields,
  ArticleFormSchema,
  type ArticleFormValues,
} from "../components/article-fields"
import { ARTICLE_LOCALES, fromDateTimeInput, localeLabel } from "../article-locales"

/**
 * «Новая статья» — the screen that did not exist (b18-blog-full).
 *
 * Ivan, 2026-09-16 08:31: «странный функционал с указанием адреса статей, с
 * отсутствием страниц на которые бы можно было бы добавить сами статьи». The
 * journal's only entry point was a strip of three inputs at the bottom of the
 * list whose FIRST field asked for a URL slug; the editor existed but was a
 * child route of an article that did not exist yet, so a shop with no articles
 * showed no page to write on at all. Measured on the live panel the same
 * morning: `GET /tenants/articles` → `{"articles":[],"count":0}`
 * (`artifacts/docs/b18-blog-full/diagnosis.md`).
 *
 * This screen is the whole article — title first, address derived from it — and
 * one save, through `POST /tenants/articles`, which now accepts the whole body
 * rather than minting an empty row.
 *
 * The language it writes is the shop's own `default_locale`, not a literal
 * `en`: a Russian shop's owner must not have to know the panel had a default
 * (the t11 lesson, `upready-store-t11-seo-locale-fallback-and-cache-trap`).
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
  const { handleSuccess } = useRouteModal()
  const { locale_settings: localeSettings } = useTenantLocaleSettings()
  const { primary_host: primaryHost } = useDomains()
  const { mutateAsync: createArticle, isPending } = useCreateTenantArticle()

  const form = useForm<ArticleFormValues>({
    defaultValues: {
      title: "",
      slug: "",
      excerpt: "",
      cover_url: "",
      body: "",
      category: "",
      author: "",
      tags: "",
      status: "draft",
      published_at: "",
      seo_title: "",
      seo_description: "",
    },
    resolver: zodResolver(ArticleFormSchema),
  })

  // `locale_settings` is null for a shop that never opened the locale screen,
  // which is «not saved yet», not «English» — the offered list starts with the
  // shop's own language when there is one and falls back to Russian, the
  // language this platform's shops are written in.
  const locale =
    localeSettings?.default_locale ??
    (ARTICLE_LOCALES.some((option) => option.value === "ru") ? "ru" : "en")

  const handleSubmit = form.handleSubmit(async (values) => {
    await createArticle(
      {
        slug: values.slug,
        locale,
        title: values.title.trim() || values.slug,
        body: values.body,
        excerpt: values.excerpt.trim() || null,
        cover_url: values.cover_url.trim() || null,
        status: values.status,
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
        onSuccess: (data) => {
          toast.success(
            values.status === "published" ? "Статья опубликована" : "Статья сохранена"
          )
          // Straight into the editor of the article just written, so the next
          // thing the owner does — add a language, fix a typo — is one click.
          handleSuccess(`/journal/${data.article.slug}`)
        },
      }
    )
  })

  return (
    <>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>Новая статья</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              Язык текста — {localeLabel(locale)}. Другие языки добавляются после
              сохранения, на экране статьи.
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>

      <RouteFocusModal.Form form={form}>
        <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-10">
            <ArticleFields form={form} autoSlug publicUrl={primaryHost} />
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
    </>
  )
}
