import { Input, Text, Textarea } from "@medusajs/ui"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../components/common/form"
import { toSlugWhileTyping } from "../../../lib/slugify"
import type { ArticleFormValues } from "./article-form"

/**
 * The tab «Для поиска» of the article editor (t-2026-10-14-01, panel redesign
 * G4): the article's address and how it reads in Yandex and Google. The
 * address is made from the title on «Новая статья» until the owner edits it
 * here (`onSlugEdited`); on an existing article a new address moves every
 * language of it at once.
 */

type Props = {
  form: UseFormReturn<ArticleFormValues>
  /** The shop's host, for the address hint; none before the shop has one. */
  host?: string
  onSlugEdited?: () => void
}

export const ArticleSearchTab = ({ form, host, onSlugEdited }: Props) => {
  const { t } = useTranslation()
  const slug = form.watch("slug")
  const url = `${host ?? ""}/journal/${slug || "…"}`

  return (
    <div className="flex flex-col items-center px-4 py-16 max-md:py-6">
      <div className="flex w-full max-w-[720px] flex-col gap-y-6">
        <Form.Field
          control={form.control}
          name="slug"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t("journal.editor.slugLabel")}</Form.Label>
              <div className="flex min-w-0 items-center gap-x-2">
                <Text size="small" leading="compact" className="text-ui-fg-muted shrink-0 font-mono">
                  {host ? `${host}/journal/` : "/journal/"}
                </Text>
                <Form.Control>
                  <Input
                    {...field}
                    className="min-w-0 flex-1 font-mono"
                    data-testid="article-slug-input"
                    onChange={(event) => {
                      onSlugEdited?.()
                      field.onChange(toSlugWhileTyping(event.target.value))
                    }}
                  />
                </Form.Control>
              </div>
              <Form.Hint>{t("journal.editor.slugHint", { url })}</Form.Hint>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
        <div className="border-ui-border-base flex flex-col gap-y-6 border-t pt-8">
          <Text size="small" className="text-ui-fg-subtle text-pretty">
            {t("journal.editor.seoHint")}
          </Text>
          <Form.Field
            control={form.control}
            name="seo_title"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("journal.editor.seoTitle")}</Form.Label>
                <Form.Control>
                  <Input {...field} />
                </Form.Control>
                <Form.Hint>{t("journal.editor.seoTitleHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="seo_description"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("journal.editor.seoDescription")}</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={3} />
                </Form.Control>
                <Form.Hint>{t("journal.editor.seoDescriptionHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </div>
      </div>
    </div>
  )
}
