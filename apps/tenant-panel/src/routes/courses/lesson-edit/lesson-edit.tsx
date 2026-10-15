import { Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { useTenantCourse, useUpdateTenantLesson } from "../../../hooks/api/courses"
import { LessonForm } from "../lesson-form/lesson-form"

// t-2026-10-14-01 (G4, prototype state `course-lesson-edit`): a lesson row and
// «Изменить» in its «…» open this drawer, headed with the lesson's number in
// the course («Урок 10»). The form mounts once the lesson is read; a lesson
// deleted since is said so, never an empty form.

export const LessonEdit = () => {
  const { t } = useTranslation()
  const { id = "", lessonId = "" } = useParams()
  const { lessons, isPending, isError, error } = useTenantCourse(id)
  const { mutateAsync: updateLesson, isPending: isSaving } = useUpdateTenantLesson(id, lessonId)

  if (isError) {
    throw error
  }

  const index = lessons?.findIndex((row) => row.id === lessonId) ?? -1
  const lesson = lessons?.[index]

  if (isPending || !lesson) {
    return (
      <RouteDrawer>
        <RouteDrawer.Header>
          <RouteDrawer.Title asChild>
            <Heading>{t("courses.lessons.title")}</Heading>
          </RouteDrawer.Title>
        </RouteDrawer.Header>
        {isPending ? null : (
          <RouteDrawer.Body>
            <Text size="small" className="text-ui-fg-subtle">
              {t("courses.lesson.notFound")}
            </Text>
          </RouteDrawer.Body>
        )}
      </RouteDrawer>
    )
  }

  return (
    <RouteDrawer>
      <LessonForm
        heading={t("courses.lesson.editTitle", { number: index + 1 })}
        description={t("courses.lesson.editDescription")}
        lesson={lesson}
        lessons={lessons ?? []}
        isPending={isSaving}
        submitLabel={t("actions.save")}
        successMessage={t("courses.lessons.toast.saved")}
        onSubmit={async (values) => {
          await updateLesson(values)
        }}
      />
    </RouteDrawer>
  )
}
