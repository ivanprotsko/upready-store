import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, Label, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import type { AdminFile, HttpTypes } from "@medusajs/types"
import { Form } from "../../../../../components/common/form"
import { HandleInput } from "../../../../../components/inputs/handle-input"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useUpdateProductCategory } from "../../../../../hooks/api/categories"
import { useDocumentDirection } from "../../../../../hooks/use-document-direction"
import { sdk } from "../../../../../lib/client"
import { toSlugWhileTyping } from "../../../../../lib/slugify"
import { mergeSeoMetadata, readSeoOverride, DEFAULT_SEO_METADATA_LOCALE } from "../../../../../lib/seo-metadata"
import { useTenantLocaleSettings } from "../../../../../hooks/api/locale-settings"
import { LOCALE_LABELS, type LocaleCode } from "../../../../../lib/locale-catalog"

const EditCategorySchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  visibility: z.enum(["public", "internal"]),
  imageUrl: z.string().optional(),
  imageAlt: z.string().optional(),
  seoTitle: z.string().max(70),
  seoDescription: z.string().max(320),
})

/**
 * The mechanism (`t-2026-09-12-mt-storefront-by-host`, W3): a category has no
 * image field in core Medusa, so it lives on `metadata.image_url` (+
 * `metadata.image_alt`) — the jsonb column every category already has, no
 * migration, no new module. Ownership stays the tenant-product-category
 * link's job; this field is never used to decide who owns a category. The
 * storefront reads it through the field selection the category routes
 * already accept (`apps/storefront/src/lib/data/categories.ts`).
 *
 * The multipart upload is the same one the home page's hero image uses
 * (`routes/home-settings/home-settings.tsx`), pointed at the same
 * `POST /tenants/uploads` — there is no `sdk.admin`-shaped wrapper for the
 * tenant namespace, so this goes through `sdk.client.fetch` directly.
 */
const uploadCategoryImage = async (file: File): Promise<AdminFile | undefined> => {
  const form = new FormData()
  form.append("files", file)

  const { files } = await sdk.client.fetch<{ files: AdminFile[] }>(
    "/tenants/uploads",
    { method: "POST", headers: { "Content-Type": null }, body: form }
  )

  return files?.[0]
}

type EditCategoryFormProps = {
  category: HttpTypes.AdminProductCategory
}

export const EditCategoryForm = ({ category }: EditCategoryFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const direction = useDocumentDirection()
  const metadata = (category.metadata ?? {}) as Record<string, unknown>
  const seoOverride = readSeoOverride(metadata, DEFAULT_SEO_METADATA_LOCALE)
  const [uploading, setUploading] = useState(false)
  const form = useForm<z.infer<typeof EditCategorySchema>>({
    defaultValues: {
      name: category.name,
      handle: category.handle,
      description: category.description || "",
      status: category.is_active ? "active" : "inactive",
      visibility: category.is_internal ? "internal" : "public",
      imageUrl: typeof metadata.image_url === "string" ? metadata.image_url : "",
      imageAlt: typeof metadata.image_alt === "string" ? metadata.image_alt : "",
      seoTitle: seoOverride.seo_title,
      seoDescription: seoOverride.seo_description,
    },
    resolver: zodResolver(EditCategorySchema),
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
    if (form.formState.dirtyFields.seoTitle || form.formState.dirtyFields.seoDescription) return

    const override = readSeoOverride(metadata, seoLocale)
    form.setValue("seoTitle", override.seo_title)
    form.setValue("seoDescription", override.seo_description)
  }, [localeSettings, seoLocale, metadata, form])

  const onUpload = async (file: File | undefined) => {
    if (!file) {
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadCategoryImage(file)
      if (uploaded?.url) {
        form.setValue("imageUrl", uploaded.url, { shouldDirty: true })
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("categories.edit.imageUploadFailed", {
              defaultValue: "The image could not be uploaded.",
            })
      )
    } finally {
      setUploading(false)
    }
  }

  const watchedImageUrl = form.watch("imageUrl")?.trim()

  const { mutateAsync, isPending } = useUpdateProductCategory(category.id)
  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      {
        name: data.name,
        description: data.description,
        handle: data.handle,
        is_active: data.status === "active",
        is_internal: data.visibility === "internal",
        metadata: {
          ...mergeSeoMetadata(metadata, data.seoTitle, data.seoDescription, seoLocale),
          image_url: data.imageUrl || null,
          image_alt: data.imageAlt || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(t("categories.edit.successToast"))
          handleSuccess()
        },
        onError: (error) => {
          toast.error(error.message)
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <RouteDrawer.Body>
          <div className="flex flex-col gap-y-4">
            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label>{t("fields.title")}</Form.Label>
                    <Form.Control>
                      <Input autoComplete="off" {...field} />
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
                    <Form.Label
                      optional
                      tooltip={t("collections.handleTooltip")}
                    >
                      {t("fields.handle")}
                    </Form.Label>
                    <Form.Control>
                      {/*
                        Transliterated as it is typed (f11-new-product-404).
                        Nothing follows the name here: the category already has
                        an address on the storefront.
                      */}
                      <HandleInput
                        {...field}
                        onChange={(event) =>
                          field.onChange(toSlugWhileTyping(event.target.value))
                        }
                      />
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
                    <Form.Label optional>{t("fields.description")}</Form.Label>
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
              name="seoTitle"
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
                      <Input autoComplete="off" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="seoDescription"
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
            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus" htmlFor="category-image">
                {t("categories.edit.image", { defaultValue: "Image" })}
              </Label>
              <div className="flex items-center gap-x-2">
                {/*
                  The picture itself, not only its address
                  (f16-category-image-not-shown): the owner uploads a file, the field
                  fills with a URL and until this preview there was nothing in the
                  panel that showed what had been saved.
                */}
                {watchedImageUrl ? (
                  <img
                    src={watchedImageUrl}
                    alt=""
                    data-testid="category-image-preview"
                    className="h-12 w-[38px] shrink-0 rounded object-cover"
                  />
                ) : null}
                <Input
                  id="category-image"
                  data-testid="category-image"
                  {...form.register("imageUrl")}
                />
                <label className="shrink-0">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="category-image-upload"
                    onChange={(e) => onUpload(e.target.files?.[0])}
                  />
                  <span className="txt-compact-small-plus inline-flex h-8 cursor-pointer items-center rounded-md border border-ui-border-base px-3 text-ui-fg-subtle hover:bg-ui-bg-base-hover">
                    {uploading
                      ? t("categories.edit.uploading", { defaultValue: "Uploading…" })
                      : t("categories.edit.upload", { defaultValue: "Upload" })}
                  </span>
                </label>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                {t("categories.edit.imageHint", {
                  defaultValue:
                    "Shown on this category's own page, and as a tile in the catalog and on the home page. Clear the address to remove it.",
                })}
              </Text>
            </div>
            <Form.Field
              control={form.control}
              name="imageAlt"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>
                      {t("categories.edit.imageAlt", { defaultValue: "Image description" })}
                    </Form.Label>
                    <Form.Control>
                      <Input autoComplete="off" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Field
                control={form.control}
                name="status"
                render={({ field: { ref, onChange, ...field } }) => {
                  return (
                    <Form.Item>
                      <Form.Label>
                        {t("categories.fields.status.label")}
                      </Form.Label>
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
                            <Select.Item value="active">
                              {t("categories.fields.status.active")}
                            </Select.Item>
                            <Select.Item value="inactive">
                              {t("categories.fields.status.inactive")}
                            </Select.Item>
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
                name="visibility"
                render={({ field: { ref, onChange, ...field } }) => {
                  return (
                    <Form.Item>
                      <Form.Label>
                        {t("categories.fields.visibility.label")}
                      </Form.Label>
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
                            <Select.Item value="public">
                              {t("categories.fields.visibility.public")}
                            </Select.Item>
                            <Select.Item value="internal">
                              {t("categories.fields.visibility.internal")}
                            </Select.Item>
                          </Select.Content>
                        </Select>
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
            </div>
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center gap-x-2">
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
