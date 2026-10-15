import { type ReactNode, useState } from "react"
import { Button, Input, ProgressTabs } from "@medusajs/ui"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../components/common/form"
import { RouteFocusModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import { toSlug } from "../../../lib/slugify"
import { ArticleCardTab } from "./article-card-tab"
import { ARTICLE_TABS, type ArticleFormValues, type ArticleTab, TAB_OF_FIELD } from "./article-form"
import { ArticleSearchTab } from "./article-search-tab"
import { EditorSplit } from "./editor-split"
import { EditorTabs } from "./editor-tabs"
import { MarkdownEditor } from "./markdown-editor"

/**
 * The article editor of «Новая статья» and of an existing article
 * (t-2026-10-14-01, panel redesign G4, prototype states `journal-edit` and
 * `journal-edit-publish`): three tabs in the header — «Текст» with the
 * reader's view beside it, «Карточка и публикация», «Для поиска» — the
 * article's name, and on the right what the caller adds (the language, the
 * status). One «Отмена / Сохранить» for every tab; a save that fails on a
 * field of another tab opens that tab.
 */

type ArticleEditorProps = {
  form: UseFormReturn<ArticleFormValues>
  onSubmit: (values: ArticleFormValues) => Promise<void>
  isPending: boolean
  /** The header's name: the article's title, or «Новая статья». */
  name: string
  aside?: ReactNode
  /** The shop's host, for the addresses; none before the shop has one. */
  host?: string
  /** Where the reader's view links to; none for a draft or a new article. */
  href?: string
  /** «Новая статья» makes the address from the title until the owner edits it. */
  autoSlug?: boolean
}

export const ArticleEditor = ({
  form,
  onSubmit,
  isPending,
  name,
  aside,
  host,
  href,
  autoSlug = false,
}: ArticleEditorProps) => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ArticleTab>("text")
  const [previewShown, setPreviewShown] = useState(true)
  const [slugTouched, setSlugTouched] = useState(!autoSlug)

  const handleSubmit = form.handleSubmit(onSubmit, (errors) => {
    const first = ARTICLE_TABS.find((one) =>
      Object.keys(errors).some((field) => TAB_OF_FIELD[field] === one)
    )
    if (first) {
      setTab(first)
    }
  })

  const title = form.watch("title")
  const body = form.watch("body")
  const slug = form.watch("slug")

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
        <ProgressTabs
          value={tab}
          onValueChange={(next) => setTab(next as ArticleTab)}
          className="flex h-full flex-col overflow-hidden"
        >
          <EditorTabs
            tabs={ARTICLE_TABS.map((value) => ({ value, label: t(`journal.editor.tabs.${value}`) }))}
            open={tab}
            title={name}
            aside={aside}
          />
          <RouteFocusModal.Body className="size-full overflow-hidden">
            <ProgressTabs.Content value="text" className="size-full">
              <EditorSplit
                previewShown={previewShown}
                previewLabel={t("journal.editor.preview")}
                title={title}
                body={body}
                address={{
                  label: `${host ?? ""}/journal/${slug || "…"}`,
                  href,
                }}
              >
                <Form.Field
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("journal.editor.titleLabel")}</Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          data-testid="article-title-input"
                          placeholder={t("journal.editor.titlePlaceholder")}
                          onChange={(event) => {
                            field.onChange(event)
                            // The address follows the title until the owner
                            // takes it over. `toSlug`, not `toSlugWhileTyping`:
                            // that one keeps a trailing hyphen, and a Russian
                            // title ends in a letter that is not `[a-z0-9]`, so
                            // every derived address came out as `…-rabotayut-`
                            // and the backend refused the save (b18, accept
                            // round 1).
                            if (!slugTouched) {
                              form.setValue("slug", toSlug(event.target.value), {
                                shouldDirty: true,
                                shouldValidate: false,
                              })
                            }
                          }}
                        />
                      </Form.Control>
                      <Form.Hint>{t("journal.editor.titleHint")}</Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
                <Form.Field
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("journal.editor.bodyLabel")}</Form.Label>
                      <Form.Control>
                        <MarkdownEditor
                          value={field.value}
                          onChange={(next) => field.onChange(next)}
                          onBlur={field.onBlur}
                          invalid={!!form.formState.errors.body}
                          previewShown={previewShown}
                          onTogglePreview={() => setPreviewShown((shown) => !shown)}
                        />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              </EditorSplit>
            </ProgressTabs.Content>
            <ProgressTabs.Content value="card" className="size-full overflow-y-auto">
              <ArticleCardTab form={form} />
            </ProgressTabs.Content>
            <ProgressTabs.Content value="search" className="size-full overflow-y-auto">
              <ArticleSearchTab form={form} host={host} onSlugEdited={() => setSlugTouched(true)} />
            </ProgressTabs.Content>
          </RouteFocusModal.Body>
        </ProgressTabs>
        <RouteFocusModal.Footer>
          <div className="flex items-center gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="article-save">
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
