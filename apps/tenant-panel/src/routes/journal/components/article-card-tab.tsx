import { useState } from "react"
import { Button, Input, Label, RadioGroup, Text, Textarea, toast } from "@medusajs/ui"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../components/common/form"
import { useTenantArticleCategories } from "../../../hooks/api/articles"
import { sdk } from "../../../lib/client"
import { ARTICLE_STATUSES } from "../article-locales"
import type { ArticleFormValues } from "./article-form"

/**
 * b18-blog-full wrote every field of an article in this file, in one column,
 * for both «Новая статья» and the edit screen.
 *
 * t-2026-10-14-01 (panel redesign, G4, prototype state `journal-edit-publish`):
 * it is the tab «Карточка и публикация» now. «Публикация»: the status as three
 * choices, each with what it means, and the date. «Карточка в ленте»: the
 * short description, the cover, the rubric with the author, the tags. The
 * title and the body moved to «Текст», the address and the search fields to
 * «Для поиска».
 */

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

/** `…/static/1700000000-liver-program.jpg` → `1700000000-liver-program.jpg`. */
const fileName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? url)

export const ArticleCardTab = ({ form }: { form: UseFormReturn<ArticleFormValues> }) => {
  const { t } = useTranslation()
  const [isUploading, setIsUploading] = useState(false)
  const { categories } = useTenantArticleCategories()

  const coverUrl = form.watch("cover_url")
  const status = form.watch("status")

  const handleCoverChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const url = await uploadCover(file)
      if (!url) {
        toast.error(t("journal.toast.uploadNoUrl"))
        return
      }
      form.setValue("cover_url", url, { shouldDirty: true })
      toast.success(t("journal.toast.coverUploaded"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("journal.toast.coverFailed"))
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const optional = <span className="text-ui-fg-muted font-normal">{t("journal.editor.optional")}</span>

  return (
    <div className="flex flex-col items-center px-4 py-16 max-md:py-6">
      <div className="flex w-full max-w-[720px] flex-col gap-y-8">
        <div className="flex flex-col gap-y-6">
          <Text size="small" weight="plus">
            {t("journal.editor.publishGroup")}
          </Text>
          <Form.Field
            control={form.control}
            name="status"
            render={({ field: { value, onChange } }) => (
              <Form.Item>
                <Form.Label>{t("journal.editor.statusLabel")}</Form.Label>
                <Form.Control>
                  <RadioGroup
                    value={value}
                    onValueChange={onChange}
                    className="flex flex-col gap-y-2"
                    data-testid="article-status"
                  >
                    {ARTICLE_STATUSES.map((option) => (
                      <div key={option} className="flex items-center gap-x-2">
                        <RadioGroup.Item value={option} id={`article-status-${option}`} />
                        <Label htmlFor={`article-status-${option}`} size="small">
                          {t(`journal.status.${option}`)}
                          <span className="text-ui-fg-subtle font-normal">
                            {" — "}
                            {t(`journal.statusHint.${option}`)}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </Form.Control>
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
                  {status === "scheduled" ? t("journal.editor.dateScheduledLabel") : t("journal.editor.dateLabel")}
                </Form.Label>
                <Form.Control>
                  <Input {...field} type="datetime-local" className="max-w-[260px]" data-testid="article-publish-at-input" />
                </Form.Control>
                <Form.Hint>
                  {status === "scheduled" ? t("journal.editor.dateScheduledHint") : t("journal.editor.dateHint")}
                </Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </div>

        <div className="border-ui-border-base flex flex-col gap-y-6 border-t pt-8">
          <Text size="small" weight="plus">
            {t("journal.editor.cardGroup")}
          </Text>
          <Form.Field
            control={form.control}
            name="excerpt"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("journal.editor.excerptLabel")}</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={3} data-testid="article-excerpt-input" />
                </Form.Control>
                <Form.Hint>{t("journal.editor.excerptHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="cover_url"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("journal.editor.coverLabel")}</Form.Label>
                <div className="flex items-center gap-x-3">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="border-ui-border-base aspect-[16/9] w-[72px] shrink-0 rounded-md border object-cover"
                      data-testid="article-cover-preview"
                    />
                  ) : null}
                  <Text size="small" className="text-ui-fg-subtle min-w-0 flex-1 truncate">
                    {coverUrl ? fileName(coverUrl) : null}
                  </Text>
                  <Button size="small" variant="secondary" asChild isLoading={isUploading}>
                    <label className="cursor-pointer">
                      {coverUrl ? t("journal.editor.coverReplace") : t("journal.editor.coverUpload")}
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
                      {t("journal.editor.coverRemove")}
                    </Button>
                  ) : null}
                </div>
                {/* An imported cover lives at an address of its own; the field
                    keeps it editable, as it was before the tabs. */}
                <Form.Control>
                  <Input
                    {...field}
                    className="font-mono"
                    placeholder="https://"
                    aria-label={t("journal.editor.coverUrlLabel")}
                  />
                </Form.Control>
                <Form.Hint>{t("journal.editor.coverHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Form.Field
              control={form.control}
              name="category"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("journal.editor.categoryLabel")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      list="article-categories"
                      placeholder={t("journal.editor.categoryPlaceholder")}
                      data-testid="article-category-input"
                    />
                  </Form.Control>
                  <datalist id="article-categories">
                    {(categories ?? []).map((option) => (
                      <option key={option.category} value={option.category}>
                        {t("journal.editor.categoryOption", { category: option.category, number: option.count })}
                      </option>
                    ))}
                  </datalist>
                  <Form.Hint>{t("journal.editor.categoryHint")}</Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="author"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("journal.editor.authorLabel")} {optional}
                  </Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder={t("journal.editor.authorPlaceholder")} />
                  </Form.Control>
                  <Form.Hint>{t("journal.editor.authorHint")}</Form.Hint>
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
                <Form.Label>
                  {t("journal.editor.tagsLabel")} {optional}
                </Form.Label>
                <Form.Control>
                  <Input {...field} placeholder={t("journal.editor.tagsPlaceholder")} />
                </Form.Control>
                <Form.Hint>{t("journal.editor.tagsHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </div>
      </div>
    </div>
  )
}
