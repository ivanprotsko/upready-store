import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { useCreateTenantLesson, useTenantCourse } from "../../../hooks/api/courses"
import { LessonForm } from "../lesson-form/lesson-form"

// t-2026-10-14-01 (G4): «Добавить урок» opens the lesson drawer empty; the
// lesson goes last in the course.

export const LessonNew = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { mutateAsync: createLesson, isPending } = useCreateTenantLesson(id)
  // The course page has already loaded it; the sections suggested in the form come from here.
  const { lessons } = useTenantCourse(id)

  return (
    <RouteDrawer>
      <LessonForm
        heading={t("courses.lesson.newTitle")}
        description={t("courses.lesson.newDescription")}
        lessons={lessons ?? []}
        isPending={isPending}
        submitLabel={t("actions.create")}
        successMessage={t("courses.lessons.toast.created")}
        onSubmit={async (values) => {
          await createLesson(values)
        }}
      />
    </RouteDrawer>
  )
}
