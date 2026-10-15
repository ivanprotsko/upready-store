import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, ProgressTabs, StatusBadge, Text, Textarea, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { SwitchBox } from "../../../../../components/common/switch-box"
import { RouteFocusModal, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useDomains } from "../../../../../hooks/api/domains"
import { TenantPage, useUpdateTenantPage } from "../../../../../hooks/api/pages"
import { EditorSplit } from "../../../../journal/components/editor-split"
import { EditorTabs } from "../../../../journal/components/editor-tabs"
import { MarkdownEditor } from "../../../../journal/components/markdown-editor"
import { STATUS_COLOR, statusOf } from "../../../page-sections"

// tenant-panel wave 2, piece 7. Own form, no Admin counterpart; built from the
// same `Form` + `KeyboundForm` + `RouteFocusModal` primitives the copied Admin
// forms use, so keyboard behaviour and error rendering match theirs.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `pages-edit` and
// `pages-edit-publish`): the fields that stood in one column moved into two
// tabs. «Текст» is the title and the body with the customer's view beside
// them; «Публикация» is where the page is seen (published, in the footer) and
// how it reads in search. One «Отмена / Сохранить» for both: a save that fails
// on a field of the other tab opens that tab.

const TABS = ["text", "publish"] as const
type Tab = (typeof TABS)[number]

const TAB_OF_FIELD: Record<string, Tab> = {
  title: "text",
  body: "text",
  seo_title: "publish",
  seo_description: "publish",
}

const SEO_TITLE_MAX = 70
const SEO_DESCRIPTION_MAX = 320

type EditPageFormProps = {
  pageKey: string
  page: TenantPage
  /** The page's name in the header: its title, else the ready section's label. */
  name: string
}

export const EditPageForm = ({ pageKey, page, name }: EditPageFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { primary_host: primaryHost } = useDomains()
  const [tab, setTab] = useState<Tab>("text")
  const [previewShown, setPreviewShown] = useState(true)

  const schema = useMemo(
    () =>
      zod
        .object({
          title: zod.string().max(200),
          body: zod.string().max(50_000),
          published: zod.boolean(),
          in_footer: zod.boolean(),
          seo_title: zod.string().max(SEO_TITLE_MAX),
          seo_description: zod.string().max(SEO_DESCRIPTION_MAX),
        })
        .refine((values) => !values.published || values.title.trim().length > 0, {
          // Mirrors the backend's own rule (`PUT /tenants/pages/:key` answers
          // `invalid_data` for it): the title is the storefront's footer link and
          // the page heading, so a published page without one ships a nameless link.
          message: t("contentPages.validation.publishedTitle"),
          path: ["title"],
        }),
    [t]
  )

  const form = useForm<zod.infer<typeof schema>>({
    defaultValues: {
      title: page.title,
      body: page.body,
      published: page.published,
      in_footer: page.in_footer,
      seo_title: page.seo_title ?? "",
      seo_description: page.seo_description ?? "",
    },
    resolver: zodResolver(schema),
  })

  const { mutateAsync, isPending } = useUpdateTenantPage(pageKey)

  const handleSubmit = form.handleSubmit(
    async (values) => {
      await mutateAsync(
        {
          title: values.title,
          body: values.body,
          published: values.published,
          in_footer: values.in_footer,
          footer_order: page.footer_order,
          seo_title: values.seo_title || null,
          seo_description: values.seo_description || null,
        },
        {
          onError: (error) => {
            toast.error(error.message)
          },
          onSuccess: () => {
            toast.success(t("contentPages.toast.saved"))
            handleSuccess()
          },
        }
      )
    },
    (errors) => {
      const first = Object.keys(errors)[0]
      if (first && TAB_OF_FIELD[first]) {
        setTab(TAB_OF_FIELD[first])
      }
    }
  )

  const title = form.watch("title")
  const body = form.watch("body")
  const status = statusOf(page)
  const address = {
    label: primaryHost ? `${primaryHost}/pages/${pageKey}` : `/pages/${pageKey}`,
    href: primaryHost && page.published ? `https://${primaryHost}/pages/${pageKey}` : undefined,
  }

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
        <ProgressTabs
          value={tab}
          onValueChange={(next) => setTab(next as Tab)}
          className="flex h-full flex-col overflow-hidden"
        >
          <EditorTabs
            tabs={TABS.map((value) => ({ value, label: t(`contentPages.editor.tabs.${value}`) }))}
            open={tab}
            title={name}
            aside={
              <StatusBadge color={STATUS_COLOR[status]} className="whitespace-nowrap max-md:hidden">
                {t(`contentPages.status.${status}`)}
              </StatusBadge>
            }
          />
          <RouteFocusModal.Body className="size-full overflow-hidden">
            <ProgressTabs.Content value="text" className="size-full">
              <EditorSplit
                previewShown={previewShown}
                previewLabel={t("contentPages.editor.preview")}
                title={title}
                body={body}
                address={address}
              >
                <Form.Field
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("contentPages.editor.titleLabel")}</Form.Label>
                      <Form.Control>
                        <Input {...field} data-testid="page-title-input" />
                      </Form.Control>
                      <Form.Hint>{t("contentPages.editor.titleHint")}</Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
                <Form.Field
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("contentPages.editor.bodyLabel")}</Form.Label>
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
            <ProgressTabs.Content value="publish" className="size-full overflow-y-auto">
              <div className="flex flex-col items-center px-4 py-16 max-md:py-6">
                <div className="flex w-full max-w-[720px] flex-col gap-y-8">
                  <div className="flex flex-col gap-y-4">
                    <Text size="small" weight="plus">
                      {t("contentPages.editor.where")}
                    </Text>
                    <SwitchBox
                      control={form.control}
                      name="published"
                      label={t("contentPages.editor.published")}
                      description={t("contentPages.editor.publishedHint", { url: address.label })}
                    />
                    <SwitchBox
                      control={form.control}
                      name="in_footer"
                      label={t("contentPages.editor.inFooter")}
                      description={t("contentPages.editor.inFooterHint")}
                    />
                  </div>
                  <div className="border-ui-border-base flex flex-col gap-y-4 border-t pt-8">
                    <div className="flex flex-col gap-y-1">
                      <Text size="small" weight="plus">
                        {t("contentPages.editor.search")}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle text-pretty">
                        {t("contentPages.editor.searchHint")}
                      </Text>
                    </div>
                    <Form.Field
                      control={form.control}
                      name="seo_title"
                      render={({ field }) => (
                        <Form.Item>
                          <Form.Label>
                            {t("contentPages.editor.seoTitle")}{" "}
                            <span className="text-ui-fg-muted tabular-nums">
                              {t("contentPages.editor.counter", {
                                length: field.value.length,
                                max: SEO_TITLE_MAX,
                              })}
                            </span>
                          </Form.Label>
                          <Form.Control>
                            <Input {...field} placeholder={name} />
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
                          <Form.Label>
                            {t("contentPages.editor.seoDescription")}{" "}
                            <span className="text-ui-fg-muted tabular-nums">
                              {t("contentPages.editor.counter", {
                                length: field.value.length,
                                max: SEO_DESCRIPTION_MAX,
                              })}
                            </span>
                          </Form.Label>
                          <Form.Control>
                            <Textarea {...field} rows={3} />
                          </Form.Control>
                          <Form.ErrorMessage />
                        </Form.Item>
                      )}
                    />
                  </div>
                </div>
              </div>
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
            <Button size="small" type="submit" isLoading={isPending} data-testid="page-save">
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
