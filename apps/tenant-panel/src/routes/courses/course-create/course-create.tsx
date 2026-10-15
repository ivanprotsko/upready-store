import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Input, Text, toast } from "@medusajs/ui"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { Combobox } from "../../../components/inputs/combobox"
import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import { useCreateTenantCourse, useTenantCourses } from "../../../hooks/api/courses"
import { useProducts } from "../../../hooks/api/products"
import { productsWithoutCourse } from "../course-labels"

// t-2026-10-14-01 (panel redesign, G4, prototype state `courses-create`):
// «Создать курс» opens this modal on `/courses/create` (panel-ds E4, the
// lead's G4 decision: a course is created in a modal with two fields, as in
// Medusa). The name, and the product it sells as, picked in a Combobox of the
// products that have no course yet. The address, the text and the lessons are
// set on the card the modal leads to.

type CreateDraft = { title: string; product_id: string }

const CreateForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync, isPending } = useCreateTenantCourse()
  const { courses } = useTenantCourses()
  const { products, isPending: isProductsPending } = useProducts({ limit: 200, fields: "id,title" })

  const options = useMemo(
    () =>
      productsWithoutCourse(products ?? [], courses ?? []).map((product) => ({
        value: product.id,
        label: product.title,
      })),
    [products, courses]
  )

  const schema = useMemo(
    () =>
      zod.object({
        title: zod.string().trim().min(1, { message: t("courses.errors.title") }),
        product_id: zod.string().min(1, { message: t("courses.errors.product") }),
      }),
    [t]
  )

  const form = useForm<CreateDraft>({
    defaultValues: { title: "", product_id: "" },
    resolver: zodResolver(schema),
  })

  const handleSubmit = form.handleSubmit(async (draft) => {
    await mutateAsync(
      { product_id: draft.product_id, title: draft.title.trim() },
      {
        onSuccess: ({ course }) => {
          toast.success(t("courses.toast.created"))
          handleSuccess(`/courses/${course.id}`)
        },
        onError: (createError) => toast.error(createError.message),
      }
    ).catch(() => undefined)
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex size-full flex-col overflow-hidden">
        <RouteFocusModal.Header />
        <RouteFocusModal.Body className="flex size-full flex-col items-center overflow-auto py-16">
          <div className="flex w-full max-w-2xl flex-col gap-y-8 px-2 md:px-0">
            <div className="flex flex-col gap-y-1">
              <RouteFocusModal.Title asChild>
                <Heading>{t("courses.createModal.title")}</Heading>
              </RouteFocusModal.Title>
              <RouteFocusModal.Description asChild>
                <Text size="small" className="text-ui-fg-subtle text-pretty">
                  {t("courses.createModal.description")}
                </Text>
              </RouteFocusModal.Description>
            </div>
            <Form.Field
              control={form.control}
              name="title"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("courses.createModal.name")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      autoComplete="off"
                      placeholder={t("courses.createModal.namePlaceholder")}
                      data-testid="course-create-title"
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="product_id"
              render={({ field: { value, onChange, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("courses.createModal.product")}</Form.Label>
                  <Form.Control>
                    <Combobox
                      {...field}
                      value={value}
                      onChange={(next) => onChange(typeof next === "string" ? next : "")}
                      options={options}
                      disabled={isProductsPending}
                      placeholder={t("courses.createModal.productPlaceholder")}
                      noResultsPlaceholder={t("courses.createModal.noProducts")}
                      data-testid="course-create-product"
                    />
                  </Form.Control>
                  <Form.Hint>{t("courses.createModal.productHint")}</Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="course-create-submit">
              {t("actions.create")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}

export const CourseCreate = () => (
  <RouteFocusModal>
    <CreateForm />
  </RouteFocusModal>
)
