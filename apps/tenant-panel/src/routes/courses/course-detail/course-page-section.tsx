import { ReactNode, useEffect, useRef, useState } from "react"
import { Plus, Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, IconButton, Input, Label, Text, Textarea, clx, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SortableList } from "../../../components/common/sortable-list"
import { useUpdateProduct } from "../../../hooks/api/products"
import { usePermissions } from "../../../hooks/use-permissions"
import {
  CoursePageDraft,
  CoursePageList,
  coursePageChanged,
  coursePageIssues,
  coursePageMetadata,
  coursePageTranslations,
  emptyRow,
  readCoursePageDraft,
} from "../course-page"

// t-2026-10-08-38: the sections of the course's product page, edited on the
// course screen. What is read, checked and written lives in `course-page.ts`;
// this file only draws it. One button saves all three lists through the
// panel's product write, the same `POST /tenants/products/:id` the product
// screens use, so whoever may change products may change this page.

type CoursePageSectionProps = {
  product?: HttpTypes.AdminProduct
  productMissing: boolean
}

export const CoursePageSection = ({ product, productMissing }: CoursePageSectionProps) => {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const readOnly = !can("catalog")

  const { mutateAsync: save, isPending: isSaving } = useUpdateProduct(product?.id ?? "")

  const [draft, setDraft] = useState<CoursePageDraft>({ about: [], faq: [], testimonials: [] })
  const [checked, setChecked] = useState(false)

  // The same rule as the course form above: the product's answer seeds the
  // form once (rule 19h), so a refetch never wipes what the owner has typed.
  const seeded = useRef(false)

  useEffect(() => {
    if (!product || seeded.current) {
      return
    }
    seeded.current = true
    setDraft(readCoursePageDraft(product.metadata))
  }, [product])

  if (!product || !seeded.current) {
    return (
      <Container className="px-6 py-4">
        <Heading level="h2">{t("coursePage.header")}</Heading>
        <Text size="small" className="text-ui-fg-subtle" data-testid="course-page-state">
          {productMissing ? t("coursePage.productMissing") : t("coursePage.loading")}
        </Text>
      </Container>
    )
  }

  const issues = checked ? coursePageIssues(draft) : []
  const invalid = (list: CoursePageList, index: number, field: string) =>
    issues.some((issue) => issue.list === list && issue.index === index && issue.field === field)
  const changed = coursePageChanged(product.metadata, draft)
  const translations = coursePageTranslations(product.metadata)

  const handleSave = async () => {
    setChecked(true)
    if (coursePageIssues(draft).length > 0) {
      toast.error(t("coursePage.incomplete"))
      return
    }

    await save(
      { metadata: coursePageMetadata(product.metadata, draft) },
      {
        onSuccess: () => toast.success(t("coursePage.saved")),
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <Container className="divide-y p-0" data-testid="course-page-section">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <Heading level="h2">{t("coursePage.header")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("coursePage.description")}
          </Text>
          {translations.length > 0 ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="course-page-translations">
              {t("coursePage.translations", { locales: translations.join(", ") })}
            </Text>
          ) : null}
          {readOnly ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="course-page-read-only">
              {t("coursePage.readOnly")}
            </Text>
          ) : null}
        </div>
        {readOnly ? null : (
          <div className="flex shrink-0 items-center gap-x-3">
            {changed ? (
              <Text size="small" className="text-ui-fg-subtle" data-testid="course-page-unsaved">
                {t("coursePage.unsaved")}
              </Text>
            ) : null}
            <Button
              size="small"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!changed}
              data-testid="course-page-save"
            >
              {t("coursePage.save")}
            </Button>
          </div>
        )}
      </div>

      <PageList
        list="about"
        rows={draft.about}
        readOnly={readOnly}
        blank={() => emptyRow("about")}
        onChange={(about) => setDraft((previous) => ({ ...previous, about }))}
        renderFields={(row, index, patch) => (
          <>
            <Field id={`${row.id}-heading`} label={t("coursePage.about.heading")}>
              <Input
                id={`${row.id}-heading`}
                value={row.heading}
                disabled={readOnly}
                aria-invalid={invalid("about", index, "heading")}
                onChange={(event) => patch({ heading: event.target.value })}
              />
            </Field>
            <Field id={`${row.id}-body`} label={t("coursePage.about.body")}>
              <Textarea
                id={`${row.id}-body`}
                value={row.body}
                rows={4}
                disabled={readOnly}
                aria-invalid={invalid("about", index, "body")}
                onChange={(event) => patch({ body: event.target.value })}
              />
            </Field>
          </>
        )}
      />

      <PageList
        list="faq"
        rows={draft.faq}
        readOnly={readOnly}
        blank={() => emptyRow("faq")}
        onChange={(faq) => setDraft((previous) => ({ ...previous, faq }))}
        renderFields={(row, index, patch) => (
          <>
            <Field id={`${row.id}-q`} label={t("coursePage.faq.q")}>
              <Input
                id={`${row.id}-q`}
                value={row.q}
                disabled={readOnly}
                aria-invalid={invalid("faq", index, "q")}
                onChange={(event) => patch({ q: event.target.value })}
              />
            </Field>
            <Field id={`${row.id}-a`} label={t("coursePage.faq.a")}>
              <Textarea
                id={`${row.id}-a`}
                value={row.a}
                rows={3}
                disabled={readOnly}
                aria-invalid={invalid("faq", index, "a")}
                onChange={(event) => patch({ a: event.target.value })}
              />
            </Field>
          </>
        )}
      />

      <PageList
        list="testimonials"
        rows={draft.testimonials}
        readOnly={readOnly}
        blank={() => emptyRow("testimonials")}
        onChange={(testimonials) => setDraft((previous) => ({ ...previous, testimonials }))}
        renderFields={(row, index, patch) => (
          <>
            <Field id={`${row.id}-author`} label={t("coursePage.testimonials.author")}>
              <Input
                id={`${row.id}-author`}
                value={row.author}
                disabled={readOnly}
                aria-invalid={invalid("testimonials", index, "author")}
                onChange={(event) => patch({ author: event.target.value })}
              />
            </Field>
            <Field id={`${row.id}-text`} label={t("coursePage.testimonials.text")}>
              <Textarea
                id={`${row.id}-text`}
                value={row.text}
                rows={4}
                disabled={readOnly}
                aria-invalid={invalid("testimonials", index, "text")}
                onChange={(event) => patch({ text: event.target.value })}
              />
            </Field>
          </>
        )}
      />
    </Container>
  )
}

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-1">
    <Label size="xsmall" htmlFor={id} className="text-ui-fg-subtle">
      {label}
    </Label>
    {children}
  </div>
)

type PageListProps<T extends { id: string }> = {
  list: CoursePageList
  rows: T[]
  readOnly: boolean
  blank: () => T
  onChange: (rows: T[]) => void
  renderFields: (row: T, index: number, patch: (fields: Partial<T>) => void) => ReactNode
}

/** One list of the page: its rows, dragged by the handle, added and deleted here. */
const PageList = <T extends { id: string }>({
  list,
  rows,
  readOnly,
  blank,
  onChange,
  renderFields,
}: PageListProps<T>) => {
  const { t } = useTranslation()

  const patchRow = (id: string) => (fields: Partial<T>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...fields } : row)))

  const removeRow = (id: string) => onChange(rows.filter((row) => row.id !== id))

  const addRow = () => onChange([...rows, blank()])

  return (
    <div className="flex flex-col gap-y-3 px-6 py-4" data-testid={`course-page-${list}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-y-1">
          <Heading level="h3">{t(`coursePage.${list}.title`)}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t(`coursePage.${list}.hint`)}
          </Text>
        </div>
        {readOnly ? null : (
          <Button
            size="small"
            variant="secondary"
            className="shrink-0"
            onClick={addRow}
            data-testid={`course-page-${list}-add`}
          >
            <Plus /> {t(`coursePage.${list}.add`)}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid={`course-page-${list}-empty`}>
          {t(`coursePage.${list}.empty`)}
        </Text>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <SortableList
            items={rows}
            onChange={onChange}
            renderItem={(row, index) => (
              <SortableList.Item
                id={row.id}
                className={clx("bg-ui-bg-base border-b", {
                  "border-b-0": index === rows.length - 1,
                })}
              >
                <div
                  className="flex w-full items-start gap-3 px-4 py-3"
                  data-testid={`course-page-${list}-row`}
                >
                  {readOnly ? null : <SortableList.DragHandle />}
                  <Text size="small" weight="plus" className="pt-1.5">
                    {index + 1}.
                  </Text>
                  <div className="flex flex-1 flex-col gap-y-2">
                    {renderFields(row, index, patchRow(row.id))}
                  </div>
                  {readOnly ? null : (
                    <IconButton
                      size="small"
                      variant="transparent"
                      aria-label={t("coursePage.remove")}
                      onClick={() => removeRow(row.id)}
                      data-testid={`course-page-${list}-remove`}
                    >
                      <Trash />
                    </IconButton>
                  )}
                </div>
              </SortableList.Item>
            )}
          />
        </div>
      )}
    </div>
  )
}
