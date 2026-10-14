import type { HttpTypes } from "@medusajs/types"
import { RadioGroup } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../components/common/form"
import { Combobox } from "../../components/inputs/combobox"
import { SettingsEditDrawer } from "../../components/settings"
import { categoriesQueryKeys } from "../../hooks/api/categories"
import { useComboboxData } from "../../hooks/use-combobox-data"
import { sdk } from "../../lib/client"
import { TextField } from "./components/text-field"
import { PRODUCTS_TITLE_MAX } from "./composition"
import { useHomeDocument } from "./use-home-edit"

// t-2026-10-14-01 (panel redesign, G4, prototype state `home-products-edit`):
// which products the list on the home page shows — the shop's lead collection
// («Популярное») or one category, with an optional heading above it. The
// category and the heading belong to a category list only, so they stay greyed
// while the source is «Популярное» (the document keeps no heading for it).
// Route `products/edit`.

const SOURCES = ["popular", "category"] as const

type ProductsValues = { source: (typeof SOURCES)[number]; category_id: string; title: string }

export const HomeProductsEdit = () => {
  const { t } = useTranslation()
  const { doc, isPending, save } = useHomeDocument()

  const saved = doc.content.products
  const defaults: ProductsValues =
    saved.source === "category"
      ? { source: "category", category_id: saved.category_id, title: saved.title }
      : { source: "popular", category_id: "", title: "" }

  const categories = useComboboxData({
    queryKey: categoriesQueryKeys.lists(),
    queryFn: (params) =>
      sdk.client.fetch<HttpTypes.AdminProductCategoryListResponse>("/tenants/product-categories", {
        query: params,
      }),
    getOptions: (data) =>
      data.product_categories.map((category) => ({ label: category.name, value: category.id })),
    defaultValue: defaults.category_id || undefined,
  })

  const schema = zod
    .object({
      source: zod.enum(SOURCES),
      category_id: zod.string(),
      title: zod.string().max(PRODUCTS_TITLE_MAX),
    })
    .superRefine((values, ctx) => {
      if (values.source === "category" && !values.category_id) {
        ctx.addIssue({ code: "custom", path: ["category_id"], message: t("homeSettings.products.categoryRequired") })
      }
    })

  return (
    <SettingsEditDrawer<ProductsValues>
      title={t("homeSettings.products.title")}
      description={t("homeSettings.products.subtitle")}
      isPending={isPending}
      schema={schema}
      defaultValues={defaults}
      onSubmit={(values) =>
        save((current) => ({
          ...current,
          content: {
            ...current.content,
            products:
              values.source === "category"
                ? { source: "category", category_id: values.category_id, title: values.title }
                : { source: "popular" },
          },
        }))
      }
      successMessage={t("homeSettings.saved")}
    >
      {(form) => {
        const isCategory = form.watch("source") === "category"

        return (
          <>
            <Form.Field
              control={form.control}
              name="source"
              render={({ field: { value, onChange, ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("homeSettings.products.source")}</Form.Label>
                  <Form.Control>
                    <RadioGroup
                      {...field}
                      ref={ref}
                      value={value}
                      onValueChange={onChange}
                      className="flex flex-col gap-y-3"
                    >
                      <RadioGroup.ChoiceBox
                        value="popular"
                        label={t("homeSettings.products.sourcePopular")}
                        description={t("homeSettings.products.sourcePopularWhy")}
                      />
                      <RadioGroup.ChoiceBox
                        value="category"
                        label={t("homeSettings.products.sourceCategory")}
                        description={t("homeSettings.products.sourceCategoryWhy")}
                      />
                    </RadioGroup>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="category_id"
              render={({ field: { value, onChange, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("homeSettings.products.category")}</Form.Label>
                  <Form.Control>
                    <Combobox
                      {...field}
                      {...categories}
                      value={value || undefined}
                      onChange={(next) => onChange((next as string | undefined) ?? "")}
                      placeholder={t("homeSettings.products.categoryPlaceholder")}
                      disabled={!isCategory}
                      data-testid="home-products-category"
                    />
                  </Form.Control>
                  {isCategory ? null : <Form.Hint>{t("homeSettings.products.categoryHint")}</Form.Hint>}
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <TextField
              control={form.control}
              name="title"
              label={t("homeSettings.products.heading")}
              optional
              placeholder={t("homeSettings.products.headingPlaceholder")}
              hint={isCategory ? undefined : t("homeSettings.products.categoryHint")}
              maxLength={PRODUCTS_TITLE_MAX}
              disabled={!isCategory}
              testId="home-products-title"
            />
          </>
        )
      }}
    </SettingsEditDrawer>
  )
}

export { HomeProductsEdit as Component }
