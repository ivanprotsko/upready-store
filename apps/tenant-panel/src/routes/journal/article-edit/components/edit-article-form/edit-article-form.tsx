import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { sdk } from "../../../../../lib/client"
import { TenantArticle, useUpdateTenantArticle } from "../../../../../hooks/api/articles"
import { fromDateInput, localeLabel, toDateInput } from "../../../article-locales"

// t10-blog. Own form, no Admin counterpart; built from the same `Form` +
// `KeyboundForm` + `RouteFocusModal` primitives the copied Admin forms use, so
// keyboard behaviour and error rendering match theirs.

const EditArticleSchema = zod
  .object({
    title: zod.string().max(300),
    excerpt: zod.string().max(1_000),
    cover_url: zod.string().max(2_000),
    body: zod.string().max(200_000),
    tags: zod.string().max(1_000),
    published: zod.boolean(),
    published_at: zod.string(),
    seo_title: zod.string().max(300),
    seo_description: zod.string().max(1_000),
  })
  .refine((values) => !values.published || values.title.trim().length > 0, {
    // Mirrors the backend's own rule (`PUT /tenants/articles/:slug` answers
    // `invalid_data` for it): the title is the feed card, the page heading and
    // the <title> tag.
    message: "У опубликованной статьи должен быть заголовок.",
    path: ["title"],
  })

/**
 * The same multipart upload the products and home screens use, pointed at
 * `POST /tenants/uploads` — every file lands under this tenant's own prefix,
 * so a cover is never served from the old shop's host.
 */
const uploadCover = async (file: File): Promise<string | undefined> => {
  const form = new FormData()
  form.append("files", file)

  const { files } = await sdk.client.fetch<{ files: Array<{ url?: string }> }>(
    "/tenants/uploads",
    { method: "POST", headers: { "Content-Type": null }, body: form }
  )

  return files?.[0]?.url
}

type EditArticleFormProps = {
  slug: string
  article: TenantArticle
}

export const EditArticleForm = ({ slug, article }: EditArticleFormProps) => {
  const { handleSuccess } = useRouteModal()
  const [isUploading, setIsUploading] = useState(false)

  const form = useForm<zod.infer<typeof EditArticleSchema>>({
    defaultValues: {
      title: article.title,
      excerpt: article.excerpt ?? "",
      cover_url: article.cover_url ?? "",
      body: article.body,
      tags: article.tags.join(", "),
      published: article.published,
      published_at: toDateInput(article.published_at),
      seo_title: article.seo_title ?? "",
      seo_description: article.seo_description ?? "",
    },
    resolver: zodResolver(EditArticleSchema),
  })

  const { mutateAsync, isPending } = useUpdateTenantArticle(slug)
  const coverUrl = form.watch("cover_url")

  const handleCoverChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const url = await uploadCover(file)
      if (!url) {
        toast.error("Загрузка не вернула адрес файла")
        return
      }
      form.setValue("cover_url", url, { shouldDirty: true })
      toast.success("Обложка загружена")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить обложку")
    } finally {
      setIsUploading(false)
      // Same file picked twice in a row still fires `change`.
      event.target.value = ""
    }
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(
      {
        locale: article.locale,
        title: values.title,
        excerpt: values.excerpt.trim() || null,
        cover_url: values.cover_url.trim() || null,
        body: values.body,
        published: values.published,
        // An empty field means "not stamped yet", not "clear the date": the
        // route stamps it on first publish only when the key is OMITTED, and
        // reads an explicit `null` as "erase the date" (t10-blog, accept
        // round 1) — a blank input owner never asked to erase anything.
        published_at: fromDateInput(values.published_at) ?? undefined,
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
          toast.success("Статья сохранена")
          handleSuccess()
        },
      }
    )
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-16">
          <div className="flex w-full max-w-[720px] flex-col gap-y-8">
            <Text size="small" className="text-ui-fg-subtle">
              Текст на языке «{localeLabel(article.locale)}». Другие языки этой
              статьи редактируются отдельно — переключатель вверху.
            </Text>

            <Form.Field
              control={form.control}
              name="title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Заголовок</Form.Label>
                  <Form.Hint>
                    Заголовок статьи, подпись карточки в ленте и заголовок вкладки
                    браузера.
                  </Form.Hint>
                  <Form.Control>
                    <Input {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Краткое описание</Form.Label>
                  <Form.Hint>
                    Две-три строки под заголовком в ленте. Они же уходят в описание
                    страницы для поисковиков, если не заполнено SEO-описание.
                  </Form.Hint>
                  <Form.Control>
                    <Textarea {...field} rows={3} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="cover_url"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Обложка</Form.Label>
                  <Form.Hint>
                    Картинка карточки в ленте и превью при отправке ссылки в
                    мессенджер. Горизонтальная, от 1200 px по ширине.
                  </Form.Hint>
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="border-ui-border-base mb-2 aspect-[16/9] w-full rounded-md border object-cover"
                    />
                  ) : null}
                  <div className="flex items-center gap-x-2">
                    <Button size="small" variant="secondary" asChild isLoading={isUploading}>
                      <label className="cursor-pointer">
                        Загрузить
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCoverChange}
                        />
                      </label>
                    </Button>
                    {coverUrl ? (
                      <Button
                        size="small"
                        variant="transparent"
                        type="button"
                        onClick={() =>
                          form.setValue("cover_url", "", { shouldDirty: true })
                        }
                      >
                        Убрать
                      </Button>
                    ) : null}
                  </div>
                  <Form.Control>
                    <Input {...field} className="mt-2 font-mono" placeholder="/static/..." />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="body"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Текст</Form.Label>
                  <Form.Hint>
                    Markdown: {"#"} — заголовок, {"-"} — пункт списка, {">"} —
                    выделенная врезка, --- — разделитель,
                    [текст](https://example.com) — ссылка, пустая строка между
                    абзацами.
                  </Form.Hint>
                  <Form.Control>
                    <Textarea {...field} rows={24} className="font-mono" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="tags"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Метки</Form.Label>
                  <Form.Hint>Через запятую. Показываются под статьёй.</Form.Hint>
                  <Form.Control>
                    <Input {...field} placeholder="детокс, пептиды" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="published"
              render={({ field: { value, onChange, ...rest } }) => (
                <Form.Item>
                  <div className="flex items-center justify-between">
                    <Form.Label>Опубликована</Form.Label>
                    <Form.Control>
                      <Switch {...rest} checked={value} onCheckedChange={onChange} />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    Опубликованная статья открыта покупателям по адресу /journal/
                    {slug} и попадает в карту сайта. Черновик видите только вы.
                  </Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="published_at"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Дата публикации</Form.Label>
                  <Form.Hint>
                    Дата на карточке и в разметке для поисковиков. Если оставить
                    пустой, она проставится при первой публикации.
                  </Form.Hint>
                  <Form.Control>
                    <Input {...field} type="date" className="w-[200px]" />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="seo_title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>SEO-заголовок</Form.Label>
                  <Form.Hint>
                    Если пусто — используется обычный заголовок статьи.
                  </Form.Hint>
                  <Form.Control>
                    <Input {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="seo_description"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>SEO-описание</Form.Label>
                  <Form.Hint>
                    Если пусто — используется краткое описание.
                  </Form.Hint>
                  <Form.Control>
                    <Textarea {...field} rows={3} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                Отмена
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              Сохранить
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
