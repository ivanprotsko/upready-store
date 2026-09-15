import { Input, Textarea } from "@medusajs/ui"
import { useEffect, useRef } from "react"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../../../components/common/form"
import { HandleInput } from "../../../../../../../components/inputs/handle-input"
import { toSlug, toSlugWhileTyping } from "../../../../../../../lib/slugify"
import { ProductCreateSchemaType } from "../../../../types"

type ProductCreateGeneralSectionProps = {
  form: UseFormReturn<ProductCreateSchemaType>
}

export const ProductCreateGeneralSection = ({
  form,
}: ProductCreateGeneralSectionProps) => {
  const { t } = useTranslation()

  /**
   * The product code follows the name until the owner writes one herself
   * (f11-new-product-404). Left empty, the code is Medusa's own `toHandle` of
   * the name, which keeps Cyrillic, and «Мёд трутневой» then lives at
   * `/products/мёд-трутневой`. Here the same name gives
   * `med-trutnevoy`, and it is in the field before anything is saved, so what
   * the owner sees is what the storefront will serve.
   *
   * Emptying the field hands the code back to the name; anything else she
   * types is hers, transliterated as she types so a Russian letter never
   * reaches the URL.
   */
  const ownCode = useRef(false)
  const title = form.watch("title")

  useEffect(() => {
    if (ownCode.current) {
      return
    }

    const next = toSlug(title ?? "")

    if (next !== form.getValues("handle")) {
      form.setValue("handle", next, { shouldDirty: false })
    }
  }, [title, form])

  return (
    <div id="general" className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-2">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Field
            control={form.control}
            name="title"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("products.fields.title.label")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      placeholder={t("products.fields.title.placeholder")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="subtitle"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label optional>
                    {t("products.fields.subtitle.label")}
                  </Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      placeholder={t("products.fields.subtitle.placeholder")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="handle"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label
                    tooltip={t("products.fields.handle.tooltip")}
                    optional
                  >
                    {t("fields.handle")}
                  </Form.Label>
                  <Form.Control>
                    <HandleInput
                      {...field}
                      onChange={(event) => {
                        const typed = toSlugWhileTyping(event.target.value)
                        ownCode.current = typed.length > 0
                        field.onChange(typed)
                      }}
                      placeholder={t("products.fields.handle.placeholder")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
        </div>
      </div>
      <Form.Field
        control={form.control}
        name="description"
        render={({ field }) => {
          return (
            <Form.Item>
              <Form.Label optional>
                {t("products.fields.description.label")}
              </Form.Label>
              <Form.Control>
                <Textarea
                  {...field}
                  placeholder={t("products.fields.description.placeholder")}
                />
              </Form.Control>
            </Form.Item>
          )
        }}
      />
    </div>
  )
}
