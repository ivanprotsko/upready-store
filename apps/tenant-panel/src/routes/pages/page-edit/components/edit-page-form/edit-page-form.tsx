import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, Switch, Textarea, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { TenantPage, useUpdateTenantPage } from "../../../../../hooks/api/pages"

// tenant-panel wave 2, piece 7. Own form, no Admin counterpart; built from the
// same `Form` + `KeyboundForm` + `RouteFocusModal` primitives the copied Admin
// forms use, so keyboard behaviour and error rendering match theirs.

const EditPageSchema = zod
  .object({
    title: zod.string().max(200),
    body: zod.string().max(50_000),
    published: zod.boolean(),
    in_footer: zod.boolean(),
  })
  .refine((values) => !values.published || values.title.trim().length > 0, {
    // Mirrors the backend's own rule (`PUT /tenants/pages/:key` answers
    // `invalid_data` for it): the title is the storefront's footer link and the
    // page heading, so a published page without one ships a nameless link.
    message: "A published page needs a title.",
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
      },
      {
        onError: (error) => {
          toast.error(error.message)
        },
        onSuccess: () => {
          toast.success("Page saved")
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
            <Form.Field
              control={form.control}
              name="title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Title</Form.Label>
                  <Form.Hint>
                    The heading of the page, and the wording of its link in the
                    storefront footer.
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
                  <Form.Label>Text</Form.Label>
                  <Form.Hint>
                    Markdown: {"#"} for a heading, {"-"} for a list item,
                    [text](https://example.com) for a link, a blank line between
                    paragraphs.
                  </Form.Hint>
                  <Form.Control>
                    <Textarea {...field} rows={18} className="font-mono" />
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
                    <Form.Label>Published</Form.Label>
                    <Form.Control>
                      <Switch
                        {...rest}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    A published page is open to shoppers at /pages/{pageKey}. A
                    draft is visible to you alone.
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
                    <Form.Label>In the footer</Form.Label>
                    <Form.Control>
                      <Switch
                        {...rest}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    A published page marked here is linked from the storefront
                    footer&apos;s Information column, alongside the shop&apos;s
                    other footer pages. Reorder it from the pages list.
                  </Form.Hint>
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
                Cancel
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              Save
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
