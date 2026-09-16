import { useState } from "react"
import { Badge, Button, Input, Select, Text, Textarea, toast } from "@medusajs/ui"
import type { UseFormReturn } from "react-hook-form"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { sdk } from "../../../lib/client"
import { toSlug, toSlugWhileTyping } from "../../../lib/slugify"
import { useTenantArticleCategories } from "../../../hooks/api/articles"
import { ARTICLE_STATUSES } from "../article-locales"
import { MarkdownEditor } from "./markdown-editor"

/**
 * Every field of an article, in one place, used by BOTH the «new article»
 * screen and the edit screen (b18-blog-full, rule 20 — one implementation).
 *
 * Before this the two were going to be the same form twice; the create path did
 * not exist at all, and the journal's only entry point was a strip of three
 * inputs whose first one asked the owner to invent a URL. Now the first field
 * is the title, the address derives from it, and the whole article is written
 * and saved on one screen.
 */

/** Lowercase latin letters, digits and single hyphens — the backend's own rule. */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The panel's own child route under `/journal`; see `App.tsx`. */
export const RESERVED_SLUG = "new"

export const ArticleFormSchema = zod
  .object({
    title: zod.string().max(300),
    slug: zod
      .string()
      .min(2, "Адрес: минимум 2 символа.")
      .max(96)
      .regex(ARTICLE_SLUG_PATTERN, "Адрес: строчные латинские буквы, цифры и дефисы."),
    excerpt: zod.string().max(1_000),
    cover_url: zod.string().max(2_000),
    body: zod.string().max(200_000),
    category: zod.string().max(120),
    author: zod.string().max(160),
    tags: zod.string().max(1_000),
    status: zod.enum(["draft", "published", "scheduled"]),
    published_at: zod.string(),
    seo_title: zod.string().max(300),
    seo_description: zod.string().max(1_000),
  })
  .refine((values) => values.slug !== RESERVED_SLUG, {
    // `/journal/new` is the create screen's own address; an article living
    // there would be unreachable in the panel forever.
    message: "Адрес «new» занят панелью. Выберите другой.",
    path: ["slug"],
  })
  .refine((values) => values.status === "draft" || values.title.trim().length > 0, {
    // The backend answers `invalid_data` for the same case; saying it here
    // means the owner reads it next to the field instead of in a toast.
    message: "У опубликованной статьи должен быть заголовок.",
    path: ["title"],
  })
  .refine((values) => values.status !== "scheduled" || values.published_at.trim().length > 0, {
    message: "Укажите дату и время, когда статья должна выйти.",
    path: ["published_at"],
  })

export type ArticleFormValues = zod.infer<typeof ArticleFormSchema>

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

type Props = {
  form: UseFormReturn<ArticleFormValues>
  /** «Новая статья» derives the address from the title until it is edited. */
  autoSlug?: boolean
  /** Where the article will live, shown next to the address field. */
  publicUrl?: string
}

export const ArticleFields = ({ form, autoSlug = false, publicUrl }: Props) => {
  const [isUploading, setIsUploading] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!autoSlug)
  const { categories } = useTenantArticleCategories()

  const coverUrl = form.watch("cover_url")
  const status = form.watch("status")
  const slug = form.watch("slug")

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
      event.target.value = ""
    }
  }

  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-y-8">
      <Form.Field
        control={form.control}
        name="title"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>Заголовок</Form.Label>
            <Form.Hint>
              С него начинается статья. Он же — подпись карточки в ленте и заголовок
              вкладки браузера.
            </Form.Hint>
            <Form.Control>
              <Input
                {...field}
                data-testid="article-title-input"
                placeholder="Пептиды Хавинсона: что это и как работают"
                onChange={(event) => {
                  field.onChange(event)
                  // The address follows the title until the owner takes it
                  // over — typing a URL is not how a person starts an article.
                  if (!slugTouched) {
                    // `toSlug`, not `toSlugWhileTyping`: that one keeps a
                    // trailing hyphen while the owner is typing INTO the
                    // address field, and a Russian title ends in a letter that
                    // is not `[a-z0-9]`, so every derived address came out as
                    // `…-rabotayut-` and the backend refused the save
                    // (measured on the stand, accept round 1: three articles
                    // created, zero saved).
                    form.setValue("slug", toSlug(event.target.value), {
                      shouldDirty: true,
                      shouldValidate: false,
                    })
                  }
                }}
              />
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
            <Form.Label>Текст статьи</Form.Label>
            <Form.Control>
              <MarkdownEditor
                value={field.value}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                invalid={!!form.formState.errors.body}
              />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Form.Field
          control={form.control}
          name="status"
          render={({ field: { value, onChange, ref: _ref, ...rest } }) => (
            <Form.Item>
              <Form.Label>Статус</Form.Label>
              <Form.Control>
                <Select {...rest} value={value} onValueChange={onChange}>
                  <Select.Trigger data-testid="article-status-select">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {ARTICLE_STATUSES.map((option) => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Form.Control>
              <Form.Hint>
                {ARTICLE_STATUSES.find((option) => option.value === status)?.hint}
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
              <Form.Label>
                {status === "scheduled" ? "Выйдет" : "Дата публикации"}
              </Form.Label>
              <Form.Control>
                <Input {...field} type="datetime-local" data-testid="article-publish-at-input" />
              </Form.Control>
              <Form.Hint>
                {status === "scheduled"
                  ? "Статья появится на сайте сама, в это время по часам вашего компьютера."
                  : "Дата на карточке и в разметке для поисковиков. Пусто — проставится при первой публикации."}
              </Form.Hint>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>

      <Form.Field
        control={form.control}
        name="excerpt"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>Краткое описание</Form.Label>
            <Form.Hint>
              Две-три строки под заголовком в ленте. Они же уходят в описание страницы
              для поисковиков, если не заполнено SEO-описание.
            </Form.Hint>
            <Form.Control>
              <Textarea {...field} rows={3} data-testid="article-excerpt-input" />
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
              Картинка карточки в ленте и превью при отправке ссылки в мессенджер.
              Горизонтальная, от 1200 px по ширине.
            </Form.Hint>
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="border-ui-border-base mb-2 aspect-[16/9] w-full max-w-[520px] rounded-md border object-cover"
                data-testid="article-cover-preview"
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
                    data-testid="article-cover-input"
                  />
                </label>
              </Button>
              {coverUrl ? (
                <Button
                  size="small"
                  variant="transparent"
                  type="button"
                  onClick={() => form.setValue("cover_url", "", { shouldDirty: true })}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Form.Field
          control={form.control}
          name="category"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>Рубрика</Form.Label>
              <Form.Hint>
                Одна на статью. По ней читатель фильтрует ленту журнала. Пишите как
                удобно — список ниже собирается из ваших же статей.
              </Form.Hint>
              <Form.Control>
                <Input {...field} placeholder="Здоровье" data-testid="article-category-input" />
              </Form.Control>
              {categories && categories.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {categories.map((option) => (
                    <button
                      key={option.category}
                      type="button"
                      onClick={() =>
                        form.setValue("category", option.category, { shouldDirty: true })
                      }
                    >
                      <Badge size="2xsmall">
                        {option.category} · {option.count}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : null}
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />

        <Form.Field
          control={form.control}
          name="author"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>Автор</Form.Label>
              <Form.Hint>
                Подпись под статьёй. Пусто — статья подписана магазином.
              </Form.Hint>
              <Form.Control>
                <Input {...field} placeholder="Оксана Черкашина" />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>

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
        name="slug"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>Адрес статьи</Form.Label>
            <Form.Hint>
              {publicUrl ? (
                <>
                  Статья будет открываться по адресу{" "}
                  <span className="font-mono">
                    {publicUrl}/journal/{slug || "…"}
                  </span>
                  . Он получается из заголовка сам; менять его стоит только до того,
                  как на статью начнут ссылаться.
                </>
              ) : (
                <>
                  Получается из заголовка сам. Менять стоит только до того, как на
                  статью начнут ссылаться: старый адрес перестанет открываться.
                </>
              )}
            </Form.Hint>
            <Form.Control>
              <Input
                {...field}
                className="font-mono"
                data-testid="article-slug-input"
                onChange={(event) => {
                  setSlugTouched(true)
                  field.onChange(toSlugWhileTyping(event.target.value))
                }}
              />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Form.Field
          control={form.control}
          name="seo_title"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>SEO-заголовок</Form.Label>
              <Form.Hint>Если пусто — используется обычный заголовок статьи.</Form.Hint>
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
              <Form.Hint>Если пусто — используется краткое описание.</Form.Hint>
              <Form.Control>
                <Textarea {...field} rows={3} />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>

      <Text size="small" className="text-ui-fg-muted">
        Черновик виден только вам. Опубликованная статья появляется в ленте /journal,
        в карте сайта и в поиске.
      </Text>
    </div>
  )
}
