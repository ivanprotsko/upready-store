import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, Select, Textarea, toast } from "@medusajs/ui"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import type { AdminFile, HttpTypes } from "@medusajs/types"
import { Form } from "../../../../../components/common/form"
import {
  ModeImagePair,
  modeImagePairLabels,
} from "../../../../../components/common/mode-image-pair"
import { HandleInput } from "../../../../../components/inputs/handle-input"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useUpdateProductCategory } from "../../../../../hooks/api/categories"
import { useDocumentDirection } from "../../../../../hooks/use-document-direction"
import { sdk } from "../../../../../lib/client"

const EditCategorySchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  visibility: z.enum(["public", "internal"]),
  imageUrl: z.string().optional(),
  imageUrlDark: z.string().optional(),
  imageAlt: z.string().optional(),
})

/**
 * The mechanism (`t-2026-09-12-mt-storefront-by-host`, W3): a category has no
 * image field in core Medusa, so it lives on `metadata.image_url` (+
 * `metadata.image_alt`, and `metadata.image_url_dark` for the dark version of the same
 * frame, `specs/store-profiles/MODE-IMAGE-PAIRS.md`) — the jsonb column every category
 * already has, no
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
  // Which slot of the pair is uploading: two buttons, one spinner each.
  const [uploading, setUploading] = useState<"light" | "dark" | null>(null)
  const form = useForm<z.infer<typeof EditCategorySchema>>({
    defaultValues: {
      name: category.name,
      handle: category.handle,
      description: category.description || "",
      status: category.is_active ? "active" : "inactive",
      visibility: category.is_internal ? "internal" : "public",
      imageUrl: typeof metadata.image_url === "string" ? metadata.image_url : "",
      imageUrlDark:
        typeof metadata.image_url_dark === "string" ? metadata.image_url_dark : "",
      imageAlt: typeof metadata.image_alt === "string" ? metadata.image_alt : "",
    },
    resolver: zodResolver(EditCategorySchema),
  })

  const onUpload = async (file: File | undefined, slot: "light" | "dark") => {
    if (!file) {
      return
    }
    setUploading(slot)
    try {
      const uploaded = await uploadCategoryImage(file)
      if (uploaded?.url) {
        form.setValue(slot === "dark" ? "imageUrlDark" : "imageUrl", uploaded.url, {
          shouldDirty: true,
        })
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
      setUploading(null)
    }
  }

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
          ...metadata,
          image_url: data.imageUrl || null,
          image_url_dark: data.imageUrlDark || null,
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
                      <HandleInput {...field} />
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
            <ModeImagePair
              label={t("categories.edit.image", { defaultValue: "Image" })}
              help={t("categories.edit.imageHint", {
                defaultValue:
                  "Shown as the tile image wherever the storefront shows this category. Clear the address to remove it.",
              })}
              labels={modeImagePairLabels(t)}
              light={{
                value: form.watch("imageUrl") ?? "",
                onChange: (next) =>
                  form.setValue("imageUrl", next, { shouldDirty: true }),
                onUpload: (file) => onUpload(file, "light"),
                uploading: uploading === "light",
                testId: "category-image",
              }}
              dark={{
                value: form.watch("imageUrlDark") ?? "",
                onChange: (next) =>
                  form.setValue("imageUrlDark", next, { shouldDirty: true }),
                onUpload: (file) => onUpload(file, "dark"),
                uploading: uploading === "dark",
                emptyHint: t("categories.edit.imageDarkEmpty", {
                  defaultValue: "Not set — dark mode shows the light image.",
                }),
                testId: "category-image-dark",
              }}
            />
            <Form.Field
              control={form.control}
              name="imageAlt"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>
                      {t("categories.edit.imageAlt", {
                        defaultValue: "Image description (both versions)",
                      })}
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
