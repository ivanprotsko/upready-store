import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Input, Select, Text, toast } from "@medusajs/ui"
import { useMemo, useRef } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import {
  ProductAttributeType,
  useCreateProductAttribute,
} from "../../../hooks/api/product-attributes"
import { ATTRIBUTE_KEY_PATTERN, ATTRIBUTE_TYPES, suggestMachineValue } from "../attribute-labels"
import { STARTER_OPTION_VALUE } from "../attribute-model"

// t-2026-10-14-01 (panel redesign, G2, prototype state `attributes-create`):
// «Создать» opens this modal on `/product-attributes/create` (panel-ds E4: a
// create is a `RouteFocusModal`). It asks for three things only: the name, the
// machine name (suggested from the name until the owner edits it) and the
// type with its hint. The rest is set on the card the modal leads to.

type CreateDraft = { name: string; key: string; type: ProductAttributeType }

const CreateForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync, isPending } = useCreateProductAttribute()
  // The machine name follows the name until the owner types in it: after that
  // it is theirs, because a filter address and an import column carry it.
  const keyTouched = useRef(false)

  const schema = useMemo(
    () =>
      zod.object({
        name: zod.string().trim().min(1, { message: t("productAttributes.errors.nameRequired") }),
        key: zod
          .string()
          .trim()
          .min(2, { message: t("productAttributes.errors.keyFormat") })
          .max(40, { message: t("productAttributes.errors.keyFormat") })
          .regex(ATTRIBUTE_KEY_PATTERN, { message: t("productAttributes.errors.keyFormat") }),
        type: zod.enum(ATTRIBUTE_TYPES as [ProductAttributeType, ...ProductAttributeType[]]),
      }),
    [t]
  )

  const form = useForm<CreateDraft>({
    defaultValues: { name: "", key: "", type: "text" },
    resolver: zodResolver(schema),
  })
  const type = useWatch({ control: form.control, name: "type" })

  const handleSubmit = form.handleSubmit(async (draft) => {
    await mutateAsync(
      {
        key: draft.key.trim().toLowerCase(),
        name: draft.name.trim(),
        type: draft.type,
        // A choice list cannot be empty: it starts with a first value the
        // owner renames on the card.
        ...(draft.type === "select"
          ? {
              options: [
                { value: STARTER_OPTION_VALUE, label: t("productAttributes.values.starter") },
              ],
            }
          : {}),
      },
      {
        onSuccess: ({ product_attribute }) => {
          toast.success(t("productAttributes.created"))
          handleSuccess(`/product-attributes/${product_attribute.id}`)
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
          <div className="flex w-full max-w-[720px] flex-col gap-y-8 px-2 md:px-0">
            <div className="flex flex-col gap-y-1">
              <RouteFocusModal.Title asChild>
                <Heading>{t("productAttributes.create.title")}</Heading>
              </RouteFocusModal.Title>
              <RouteFocusModal.Description asChild>
                <Text size="small" className="text-ui-fg-subtle text-pretty">
                  {t("productAttributes.create.description")}
                </Text>
              </RouteFocusModal.Description>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Field
                control={form.control}
                name="name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t("productAttributes.fields.name")}</Form.Label>
                    <Form.Control>
                      <Input
                        {...field}
                        autoComplete="off"
                        onChange={(event) => {
                          field.onChange(event)
                          if (!keyTouched.current) {
                            form.setValue("key", suggestMachineValue(event.target.value))
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
                name="key"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t("productAttributes.fields.key")}</Form.Label>
                    <Form.Control>
                      <Input
                        {...field}
                        autoComplete="off"
                        className="font-mono"
                        onChange={(event) => {
                          keyTouched.current = true
                          field.onChange(event)
                        }}
                      />
                    </Form.Control>
                    <Form.Hint>{t("productAttributes.fields.keyCreateHint")}</Form.Hint>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
            </div>
            <Form.Field
              control={form.control}
              name="type"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item className="max-w-[360px]">
                  <Form.Label>{t("productAttributes.fields.type")}</Form.Label>
                  <Form.Control>
                    <Select {...field} value={value} onValueChange={onChange}>
                      <Select.Trigger ref={ref}>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {ATTRIBUTE_TYPES.map((option) => (
                          <Select.Item key={option} value={option}>
                            {t(`productAttributes.types.${option}`)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.Hint>
                    {t(`productAttributes.typeHints.${type}`)}
                    {type === "select" ? ` ${t("productAttributes.create.selectHint")}` : ""}
                  </Form.Hint>
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
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.create")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}

export const AttributeCreate = () => (
  <RouteFocusModal>
    <CreateForm />
  </RouteFocusModal>
)
