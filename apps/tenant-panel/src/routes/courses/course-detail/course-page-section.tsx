import { ArrowLongDown, ArrowLongUp, PencilSquare, Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Button, Container, Heading, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SettingsDetailSection } from "../../../components/settings"
import { useUpdateProduct } from "../../../hooks/api/products"
import { usePermissions } from "../../../hooks/use-permissions"
import {
  COURSE_PAGE_LISTS,
  CoursePageList,
  coursePageEntryText,
  coursePageTranslations,
  moveCoursePageEntry,
  readCoursePageDraft,
  removeCoursePageEntry,
} from "../course-page"
import { NumberedList } from "./numbered-list"

// t-2026-10-08-38: the sections of the course's product page, edited on the
// course screen. What is read and written lives in `course-page.ts`; this file
// only draws it, and writes through the panel's product write, the same
// `POST /tenants/products/:id` the product screens use, so whoever may change
// products may change this page.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `course`,
// `course-block-edit`): the three lists read at the bottom of the course card
// (the lead's G4 decision), one section each. An entry is a numbered row;
// it opens its drawer (`page/:list/:index`), «Добавить …» in the section's
// header opens an empty one (`page/:list/new`), and the row's «…» moves it or
// deletes it behind a prompt. Each of those writes the whole `metadata` with
// that one change. Without `catalog` the lists only read.

type CoursePageSectionProps = {
  product?: HttpTypes.AdminProduct
  productMissing: boolean
}

export const CoursePageSection = ({ product, productMissing }: CoursePageSectionProps) => {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const prompt = usePrompt()
  const readOnly = !can("catalog")

  const { mutateAsync: save, isPending: isSaving } = useUpdateProduct(product?.id ?? "")

  if (!product) {
    return (
      <Container className="px-6 py-4">
        <Heading level="h2">{t("coursePage.header")}</Heading>
        <Text size="small" className="text-ui-fg-subtle" data-testid="course-page-state">
          {productMissing ? t("coursePage.productMissing") : t("coursePage.loading")}
        </Text>
      </Container>
    )
  }

  const draft = readCoursePageDraft(product.metadata)
  const translations = coursePageTranslations(product.metadata)

  const write = async (metadata: Record<string, unknown> | null, success: string) => {
    if (!metadata) {
      return
    }
    try {
      await save({ metadata })
      toast.success(success)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const remove = async (list: CoursePageList, index: number, title: string) => {
    const confirmed = await prompt({
      title: t(`coursePage.${list}.deleteTitle`, { title }),
      description: t("coursePage.deleteDescription"),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (confirmed) {
      await write(removeCoursePageEntry(product.metadata, list, index), t("coursePage.deleted"))
    }
  }

  return (
    <>
      {COURSE_PAGE_LISTS.map((list) => {
        const rows = draft[list] as Record<string, unknown>[]

        return (
          <SettingsDetailSection
            key={list}
            section={{
              id: `course-page-${list}`,
              title: t(`coursePage.${list}.title`),
              description: t(`coursePage.${list}.hint`),
              actions: [],
              action: readOnly ? undefined : (
                <Button size="small" variant="secondary" asChild>
                  <Link to={`page/${list}/new`} data-testid={`course-page-${list}-add`}>
                    {t(`coursePage.${list}.add`)}
                  </Link>
                </Button>
              ),
              rows: [],
              body: (
                <>
                  {/* Said once, above the first list: the owner edits the shop's own language. */}
                  {list === "about" && (translations.length > 0 || readOnly) ? (
                    <div className="flex flex-col gap-y-1 px-6 py-3">
                      {translations.length > 0 ? (
                        <Text size="small" className="text-ui-fg-subtle text-pretty" data-testid="course-page-translations">
                          {t("coursePage.translations", { locales: translations.join(", ") })}
                        </Text>
                      ) : null}
                      {readOnly ? (
                        <Text size="small" className="text-ui-fg-subtle text-pretty" data-testid="course-page-read-only">
                          {t("coursePage.readOnly")}
                        </Text>
                      ) : null}
                    </div>
                  ) : null}
                  <NumberedList
                    items={rows}
                    // The draft's row ids are new on every read; the place is the entry's key.
                    getKey={(_row, index) => `${list}-${index}`}
                    title={(row) => coursePageEntryText(list, row).title || "—"}
                    sub={(row) => coursePageEntryText(list, row).text || "—"}
                    to={readOnly ? undefined : (_row, index) => `page/${list}/${index}`}
                    actions={
                      readOnly
                        ? undefined
                        : (row, index) => [
                            {
                              actions: [
                                {
                                  icon: <PencilSquare />,
                                  label: t("actions.change"),
                                  to: `page/${list}/${index}`,
                                },
                              ],
                            },
                            {
                              actions: [
                                {
                                  icon: <ArrowLongUp />,
                                  label: t("coursePage.moveUp"),
                                  disabled: isSaving || index === 0,
                                  onClick: () =>
                                    void write(
                                      moveCoursePageEntry(product.metadata, list, index, -1),
                                      t("coursePage.moved")
                                    ),
                                },
                                {
                                  icon: <ArrowLongDown />,
                                  label: t("coursePage.moveDown"),
                                  disabled: isSaving || index === rows.length - 1,
                                  onClick: () =>
                                    void write(
                                      moveCoursePageEntry(product.metadata, list, index, 1),
                                      t("coursePage.moved")
                                    ),
                                },
                              ],
                            },
                            {
                              actions: [
                                {
                                  icon: <Trash />,
                                  label: t(`coursePage.${list}.delete`),
                                  destructive: true,
                                  onClick: () =>
                                    void remove(list, index, coursePageEntryText(list, row).title),
                                },
                              ],
                            },
                          ]
                    }
                    empty={{
                      title: t(`coursePage.${list}.empty`),
                      message: t(`coursePage.${list}.emptyMessage`),
                    }}
                    testId={`course-page-${list}`}
                  />
                </>
              ),
            }}
          />
        )
      })}
    </>
  )
}
