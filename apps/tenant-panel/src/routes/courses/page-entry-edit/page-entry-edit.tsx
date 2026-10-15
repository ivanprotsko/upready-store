import { Heading, Input, Text, Textarea } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { RouteDrawer } from "../../../components/modals"
import { SettingsEditDrawer } from "../../../components/settings"
import { useTenantCourse } from "../../../hooks/api/courses"
import { useProduct, useUpdateProduct } from "../../../hooks/api/products"
import {
  COURSE_PAGE_FIELDS,
  coursePageEntryText,
  isCoursePageList,
  putCoursePageEntry,
  readCoursePageDraft,
} from "../course-page"

// t-2026-10-14-01 (panel redesign, G4, prototype state `course-block-edit`):
// one entry of the course page in a drawer, on `page/:list/new` and
// `page/:list/:index` under the course card. Two fields, the ones the
// storefront drops an entry without (`COURSE_PAGE_FIELDS`), so both are
// required. The save writes the product's whole `metadata` with this one
// entry changed or added last (`putCoursePageEntry`).

type EntryDraft = { title: string; text: string }

const EntryNotFound = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("coursePage.header")}</Heading>
        </RouteDrawer.Title>
      </RouteDrawer.Header>
      <RouteDrawer.Body>
        <Text size="small" className="text-ui-fg-subtle">
          {t("coursePage.notFound")}
        </Text>
      </RouteDrawer.Body>
    </RouteDrawer>
  )
}

export const PageEntryEdit = () => {
  const { t } = useTranslation()
  const { id = "", list, index: indexParam } = useParams()
  const { course, isError, error } = useTenantCourse(id)
  const { product, isPending: isProductPending } = useProduct(course?.product_id ?? "", undefined, {
    enabled: Boolean(course?.product_id),
  })
  const { mutateAsync } = useUpdateProduct(product?.id ?? "")

  const schema = useMemo(
    () =>
      zod.object({
        title: zod.string().trim().min(1, { message: t("coursePage.required") }),
        text: zod.string().trim().min(1, { message: t("coursePage.required") }),
      }),
    [t]
  )

  if (isError) {
    throw error
  }

  const index = indexParam === undefined ? null : Number(indexParam)
  if (!isCoursePageList(list) || (index !== null && !(Number.isInteger(index) && index >= 0))) {
    return <EntryNotFound />
  }

  const rows = product ? (readCoursePageDraft(product.metadata)[list] as Record<string, unknown>[]) : []
  const entry = index === null ? undefined : rows[index]
  // An address of an entry someone has deleted since: say so, never an empty form.
  if (product && index !== null && !entry) {
    return <EntryNotFound />
  }

  const [titleField, textField] = COURSE_PAGE_FIELDS[list]
  const saved = entry ? coursePageEntryText(list, entry) : { title: "", text: "" }

  return (
    <SettingsEditDrawer<EntryDraft>
      title={
        index === null
          ? t(`coursePage.${list}.newTitle`)
          : t(`coursePage.${list}.editTitle`, { number: index + 1 })
      }
      description={t(`coursePage.${list}.hint`)}
      isPending={!course || isProductPending || !product}
      schema={schema}
      defaultValues={saved}
      onSubmit={(values) =>
        mutateAsync({
          metadata: putCoursePageEntry(product?.metadata, list, index, {
            [titleField]: values.title.trim(),
            [textField]: values.text.trim(),
          }),
        })
      }
      successMessage={t("coursePage.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="title"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t(`coursePage.${list}.${titleField}`)}</Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="text"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t(`coursePage.${list}.${textField}`)}</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={10} />
                </Form.Control>
                {list === "testimonials" ? null : <Form.Hint>{t("coursePage.bodyHint")}</Form.Hint>}
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
