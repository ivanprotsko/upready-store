import { Input, Switch, Text, Textarea } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { useTenantCourse, useUpdateTenantCourse } from "../../../hooks/api/courses"

// t-2026-10-14-01 (panel redesign, G4, prototype state `course-edit`): the
// drawer «Курс» on `/courses/:id/edit`, opened from «Изменить» in the card's
// «…» and in the list row's «…». The four fields that stood open on the card:
// the name, the address, the description and «Курс опубликован».

type CourseDraft = { title: string; slug: string; description: string; published: boolean }

export const CourseEdit = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { course, isPending, isError, error } = useTenantCourse(id)
  const { mutateAsync } = useUpdateTenantCourse(id)

  const schema = useMemo(
    () =>
      zod.object({
        title: zod.string().trim().min(1, { message: t("courses.errors.title") }),
        slug: zod.string(),
        description: zod.string(),
        published: zod.boolean(),
      }),
    [t]
  )

  if (isError) {
    throw error
  }

  return (
    <SettingsEditDrawer<CourseDraft>
      title={t("courses.edit.title")}
      isPending={isPending || !course}
      schema={schema}
      defaultValues={{
        title: course?.title ?? "",
        slug: course?.slug ?? "",
        description: course?.description ?? "",
        published: course?.status === "published",
      }}
      onSubmit={(values) =>
        mutateAsync({
          title: values.title.trim(),
          slug: values.slug.trim() || undefined,
          description: values.description.trim() || null,
          status: values.published ? "published" : "draft",
        })
      }
      successMessage={t("courses.toast.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="title"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("courses.edit.name")}</Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="slug"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("courses.edit.slug")}</Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" className="font-mono" />
                </Form.Control>
                <Form.Hint>{t("courses.edit.slugHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="description"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("courses.edit.description")}</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={5} />
                </Form.Control>
                <Form.Hint>{t("courses.edit.descriptionHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="published"
            render={({ field: { value, onChange, ...field } }) => (
              <Form.Item>
                <div className="flex items-start justify-between gap-x-4">
                  <div className="flex flex-col gap-y-1">
                    <Form.Label>{t("courses.edit.published")}</Form.Label>
                    <Text size="small" className="text-ui-fg-subtle text-pretty">
                      {t("courses.edit.publishedHint")}
                    </Text>
                  </div>
                  <Form.Control>
                    <Switch {...field} checked={value} onCheckedChange={onChange} />
                  </Form.Control>
                </div>
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
