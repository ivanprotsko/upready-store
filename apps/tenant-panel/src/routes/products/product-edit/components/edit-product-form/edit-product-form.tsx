import { Button, Input, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { HttpTypes } from "@medusajs/types"
import { Form } from "../../../../../components/common/form"
import { SwitchBox } from "../../../../../components/common/switch-box"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { useExtendableForm } from "../../../../../dashboard-app/forms/hooks"
import { useUpdateProduct } from "../../../../../hooks/api/products"
import { transformNullableFormData } from "../../../../../lib/form-helpers"
import { toSlugWhileTyping } from "../../../../../lib/slugify"

import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { FormExtensionZone } from "../../../../../dashboard-app"
import { useExtension } from "../../../../../providers/extension-provider"
import { useDocumentDirection } from "../../../../../hooks/use-document-direction"
import { mergeSeoMetadata, readSeoOverride, DEFAULT_SEO_METADATA_LOCALE } from "../../../../../lib/seo-metadata"
import { useTenantLocaleSettings } from "../../../../../hooks/api/locale-settings"
import { LOCALE_LABELS, type LocaleCode } from "../../../../../lib/locale-catalog"

type EditProductFormProps = {
  product: HttpTypes.AdminProduct
}

const EditProductSchema = zod.object({
  status: zod.enum(["draft", "published", "proposed", "rejected"]),
  title: zod.string().min(1),
  subtitle: zod.string().optional(),
  handle: zod.string().min(1),
  material: zod.string().optional(),
  description: zod.string().optional(),
  discountable: zod.boolean(),
  seo_title: zod.string().max(70),
  seo_description: zod.string().max(320),
})

export const EditProductForm = ({ product }: EditProductFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const direction = useDocumentDirection()
  const { getFormFields, getFormConfigs } = useExtension()
  const fields = getFormFields("product", "edit")
  const configs = getFormConfigs("product", "edit")

  const productMetadata = product.metadata as Record<string, unknown> | null
  const seoOverride = readSeoOverride(productMetadata, DEFAULT_SEO_METADATA_LOCALE)

  const form = useExtendableForm({
    defaultValues: {
      status: product.status,
      title: product.title,
      material: product.material || "",
      subtitle: product.subtitle || "",
      handle: product.handle || "",
      description: product.description || "",
      discountable: product.discountable,
      seo_title: seoOverride.seo_title,
      seo_description: seoOverride.seo_description,
    },
    schema: EditProductSchema,
    configs: configs,
    data: product,
  })

  // The shop's own default_locale (t06-locale-currency) is loaded async, so
  // the form above mounts on the DEFAULT_SEO_METADATA_LOCALE guess first —
  // round 2 finding: a default_locale=ru shop's SEO fields were silently
  // written to metadata.seo.en, never reaching the storefront's ru pages.
  // Once locale settings resolve, the real locale's entry replaces that
  // guess, but only before the owner has touched either field.
  const { locale_settings: localeSettings } = useTenantLocaleSettings()
  const seoLocale = localeSettings?.default_locale ?? DEFAULT_SEO_METADATA_LOCALE
  const seoLocaleAppliedRef = useRef(false)
  useEffect(() => {
    if (seoLocaleAppliedRef.current) return
    if (!localeSettings) return
    seoLocaleAppliedRef.current = true
    if (seoLocale === DEFAULT_SEO_METADATA_LOCALE) return
    if (form.formState.dirtyFields.seo_title || form.formState.dirtyFields.seo_description) return

    const override = readSeoOverride(productMetadata, seoLocale)
    form.setValue("seo_title", override.seo_title)
    form.setValue("seo_description", override.seo_description)
  }, [localeSettings, seoLocale, productMetadata, form])

  const { mutateAsync, isPending } = useUpdateProduct(product.id)

  const handleSubmit = form.handleSubmit(async (data) => {
    const { title, discountable, handle, status, seo_title, seo_description, ...optional } =
      data

    const nullableData = transformNullableFormData(optional)
    const metadata = mergeSeoMetadata(
      product.metadata as Record<string, unknown> | null,
      seo_title,
      seo_description,
      seoLocale
    )

    await mutateAsync(
      {
        title,
        discountable,
        handle,
        status: status as HttpTypes.AdminProductStatus,
        metadata,
        ...nullableData,
      },
      {
        onSuccess: ({ product }) => {
          toast.success(
            t("products.edit.successToast", { title: product.title })
          )
          handleSuccess()
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-1 flex-col gap-y-8 overflow-y-auto">
          <div className="flex flex-col gap-y-8">
            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="status"
                render={({ field: { onChange, ref, ...field } }) => {
                  return (
                    <Form.Item>
                      <Form.Label>{t("fields.status")}</Form.Label>
                      <Form.Control>
                        <Select
                          dir={direction}
                          {...field}
                          onValueChange={onChange}
                        >
                          <Select.Trigger ref={ref}>
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Content>
                            {(
                              [
                                "draft",
                                "published",
                                "proposed",
                                "rejected",
                              ] as const
                            ).map((status) => {
                              return (
                                <Select.Item key={status} value={status}>
                                  {t(`products.productStatus.${status}`)}
                                </Select.Item>
                              )
                            })}
                          </Select.Content>
                        </Select>
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="title"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Label>{t("fields.title")}</Form.Label>
                      <Form.Control>
                        <Input {...field} />
                      </Form.Control>
                      <Form.ErrorMessage />
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
                      <Form.Label optional>{t("fields.subtitle")}</Form.Label>
                      <Form.Control>
                        <Input {...field} />
                      </Form.Control>
                      <Form.ErrorMessage />
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
                      <Form.Label>{t("fields.handle")}</Form.Label>
                      <Form.Control>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 z-10 flex w-8 items-center justify-center border-r">
                            <Text
                              className="text-ui-fg-muted"
                              size="small"
                              leading="compact"
                              weight="plus"
                            >
                              /
                            </Text>
                          </div>
                          {/*
                            Transliterated as it is typed, so an edit never
                            puts a Cyrillic letter into the storefront URL
                            (f11-new-product-404). Unlike the create wizard,
                            nothing here follows the name: this product already
                            has an address, and moving it silently would break
                            every link to it.
                          */}
                          <Input
                            {...field}
                            onChange={(event) =>
                              field.onChange(
                                toSlugWhileTyping(event.target.value)
                              )
                            }
                            className="pl-10"
                          />
                        </div>
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="material"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Label optional>{t("fields.material")}</Form.Label>
                      <Form.Control>
                        <Input {...field} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="description"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Label optional>
                        {t("fields.description")}
                      </Form.Label>
                      <Form.Control>
                        <Textarea {...field} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="seo_title"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Label optional>
                        {t("fields.seoTitle")}{" "}
                        <span className="text-ui-fg-subtle">
                          ({LOCALE_LABELS[seoLocale as LocaleCode] ?? seoLocale}, {field.value.length}/70)
                        </span>
                      </Form.Label>
                      <Form.Control>
                        <Input {...field} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="seo_description"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Label optional>
                        {t("fields.seoDescription")}{" "}
                        <span className="text-ui-fg-subtle">
                          ({LOCALE_LABELS[seoLocale as LocaleCode] ?? seoLocale}, {field.value.length}/320)
                        </span>
                      </Form.Label>
                      <Form.Control>
                        <Textarea {...field} rows={3} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
            </div>
            <SwitchBox
              control={form.control}
              name="discountable"
              label={t("fields.discountable")}
              description={t("products.discountableHint")}
            />
            <FormExtensionZone fields={fields} form={form} />
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
