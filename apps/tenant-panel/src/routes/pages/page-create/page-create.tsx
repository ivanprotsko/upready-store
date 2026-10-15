import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Input, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import { useDomains } from "../../../hooks/api/domains"
import { useCreateTenantPage, useTenantPages } from "../../../hooks/api/pages"
import { toSlug, toSlugWhileTyping } from "../../../lib/slugify"
import { pageSlugProblem } from "../page-sections"

// t-2026-10-14-01 (panel redesign, G4, prototype state `pages-create`): a
// page of the owner's own is created in a modal behind «Добавить страницу» in
// the list's header, the way «Добавить товар» opens its own (Ivan 14.10: «пусть
// появляется когда юзер нажимает "добавить страницу" как например в товара
// контрол "добавить товар"»). Two fields: the title first, the address made
// from it until the owner edits the address. «Создать и открыть» goes straight
// into the editor of the new page: the text is written there.

export const PageCreate = () => (
  <RouteFocusModal>
    <CreatePageForm />
  </RouteFocusModal>
)

/**
 * Inside the modal on purpose: `useRouteModal` only exists under
 * `RouteFocusModal`'s own provider, and it releases the «unsaved changes»
 * guard on a successful save (the journal's lesson, `article-new.tsx`).
 */
const CreatePageForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { pages } = useTenantPages()
  const { primary_host: primaryHost } = useDomains()
  const { mutateAsync: createPage, isPending } = useCreateTenantPage()
  const [slugTouched, setSlugTouched] = useState(false)

  const taken = useMemo(() => (pages ?? []).map((page) => page.key), [pages])
  const schema = useMemo(
    () =>
      zod
        .object({
          title: zod.string().max(200),
          slug: zod.string(),
        })
        .superRefine((values, ctx) => {
          if (!values.title.trim()) {
            ctx.addIssue({ code: "custom", path: ["title"], message: t("contentPages.validation.title") })
          }
          const problem = pageSlugProblem(values.slug, taken)
          if (problem) {
            ctx.addIssue({
              code: "custom",
              path: ["slug"],
              message: t(`contentPages.validation.${problem}`, { slug: values.slug }),
            })
          }
        }),
    [t, taken]
  )

  const form = useForm<{ title: string; slug: string }>({
    defaultValues: { title: "", slug: "" },
    resolver: zodResolver(schema),
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    await createPage(
      { slug: values.slug, title: values.title.trim() },
      {
        onSuccess: ({ page }) => {
          toast.success(t("contentPages.toast.created"))
          handleSuccess(`/pages/${page.key}`)
        },
        onError: (createError) => toast.error(createError.message),
      }
    )
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
        <RouteFocusModal.Header>
          <RouteFocusModal.Title asChild>
            <span className="txt-compact-small-plus flex-1 border-l px-4">{t("contentPages.create.title")}</span>
          </RouteFocusModal.Title>
        </RouteFocusModal.Header>
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-16 max-md:py-6">
          <div className="flex w-full max-w-[720px] flex-col gap-y-6">
            <div className="flex flex-col gap-y-1">
              <Heading>{t("contentPages.create.title")}</Heading>
              <RouteFocusModal.Description asChild>
                <Text size="small" className="text-ui-fg-subtle text-pretty">
                  {t("contentPages.create.description")}
                </Text>
              </RouteFocusModal.Description>
            </div>
            <Form.Field
              control={form.control}
              name="title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("contentPages.create.titleLabel")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      autoFocus
                      placeholder={t("contentPages.create.titlePlaceholder")}
                      data-testid="page-create-title"
                      onChange={(event) => {
                        field.onChange(event)
                        // The address follows the title until the owner takes it over.
                        if (!slugTouched) {
                          form.setValue("slug", toSlug(event.target.value).slice(0, 48), {
                            shouldDirty: true,
                          })
                        }
                      }}
                    />
                  </Form.Control>
                  <Form.Hint>{t("contentPages.create.titleHint")}</Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="slug"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("contentPages.create.slugLabel")}</Form.Label>
                  <div className="flex min-w-0 items-center gap-x-2">
                    <Text size="small" leading="compact" className="text-ui-fg-muted shrink-0 font-mono">
                      {primaryHost ? `${primaryHost}/pages/` : "/pages/"}
                    </Text>
                    <Form.Control>
                      <Input
                        {...field}
                        className="min-w-0 flex-1 font-mono"
                        data-testid="page-create-slug"
                        onChange={(event) => {
                          setSlugTouched(true)
                          field.onChange(toSlugWhileTyping(event.target.value))
                        }}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>{t("contentPages.create.slugHint")}</Form.Hint>
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
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="page-create-submit">
              {t("contentPages.create.submit")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
