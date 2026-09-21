import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, Switch, Textarea, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { TenantPage, useUpdateTenantPage } from "../../../../../hooks/api/pages"
import { MarkdownEditor } from "../../../../journal/components/markdown-editor"

// tenant-panel wave 2, piece 7. Own form, no Admin counterpart; built from the
// same `Form` + `KeyboundForm` + `RouteFocusModal` primitives the copied Admin
// forms use, so keyboard behaviour and error rendering match theirs.

const EditPageSchema = zod
  .object({
    title: zod.string().max(200),
    body: zod.string().max(50_000),
    published: zod.boolean(),
    in_footer: zod.boolean(),
    seo_title: zod.string().max(70),
    seo_description: zod.string().max(320),
  })
  .refine((values) => !values.published || values.title.trim().length > 0, {
    // Mirrors the backend's own rule (`PUT /tenants/pages/:key` answers
    // `invalid_data` for it): the title is the storefront's footer link and the
    // page heading, so a published page without one ships a nameless link.
    message: "У опубликованной страницы должен быть заголовок.",
    path: ["title"],
  })

type EditPageFormProps = {
  pageKey: string
  page: TenantPage
}

export const EditPageForm = ({ pageKey, page }: EditPageFormProps) => {
  const { handleSuccess } = useRouteModal()
  const form = useForm<zod.infer<typeof EditPageSchema>>({
    defaultValues: {
      title: page.title,
      body: page.body,
      published: page.published,
      in_footer: page.in_footer,
      seo_title: page.seo_title ?? "",
      seo_description: page.seo_description ?? "",
    },
    resolver: zodResolver(EditPageSchema),
  })

  const { mutateAsync, isPending } = useUpdateTenantPage(pageKey)

  const handleSubmit = form.handleSubmit(async (values) => {
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
          toast.success("Страница сохранена")
          handleSuccess()
        },
      }
    )
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-16 max-md:py-6">
          <div className="flex w-full max-w-[1080px] flex-col gap-y-8">
            <Form.Field
              control={form.control}
              name="title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Заголовок</Form.Label>
                  <Form.Hint>
                    Заголовок страницы и текст её ссылки в подвале магазина.
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
              name="body"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Текст</Form.Label>
                  <Form.Control>
                    {/* o21-owner-panel-ux (P4): the journal's editor, so the
                        owner gets the buttons and a preview drawn by the same
                        parser the shop page uses, instead of writing blind. */}
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
            <Form.Field
              control={form.control}
              name="published"
              render={({ field: { value, onChange, ...rest } }) => (
                <Form.Item>
                  <div className="flex items-center justify-between">
                    <Form.Label>Опубликована</Form.Label>
                    <Form.Control>
                      <Switch
                        {...rest}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    Опубликованная страница открыта покупателям по адресу
                    /pages/{pageKey}. Черновик видите только вы.
                  </Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="in_footer"
              render={({ field: { value, onChange, ...rest } }) => (
                <Form.Item>
                  <div className="flex items-center justify-between">
                    <Form.Label>В подвале</Form.Label>
                    <Form.Control>
                      <Switch
                        {...rest}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    Опубликованная страница, отмеченная здесь, появляется в
                    подвале магазина, в блоке «Информация», рядом с другими
                    страницами подвала. Порядок меняется в списке страниц.
                  </Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="seo_title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    Заголовок для поиска{" "}
                    <span className="text-ui-fg-subtle">({field.value.length}/70)</span>
                  </Form.Label>
                  <Form.Hint>
                    Показывается как заголовок страницы в результатах поиска.
                    Пусто — берётся заголовок выше.
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
                  <Form.Label>
                    Описание для поиска{" "}
                    <span className="text-ui-fg-subtle">({field.value.length}/320)</span>
                  </Form.Label>
                  <Form.Hint>
                    Показывается под заголовком в результатах поиска. Пусто —
                    берётся первое предложение страницы.
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
