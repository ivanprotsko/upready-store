import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { useTenantCourse, useUpdateTenantLesson } from "../../../hooks/api/courses"
import { LessonForm } from "../lesson-form/lesson-form"

export const LessonEdit = () => {
  const { id = "", lessonId = "" } = useParams()
  const { lessons, isPending, isError, error } = useTenantCourse(id)
  const { mutateAsync: updateLesson, isPending: isSaving } = useUpdateTenantLesson(id, lessonId)

  if (isError) {
    throw error
  }

  const lesson = lessons?.find((row) => row.id === lessonId)

  return (
    <RouteFocusModal>
      {isPending || !lesson ? (
        <SingleColumnPageSkeleton sections={1} />
      ) : (
        <LessonForm
          heading={lesson.title}
          description="Изменения видны покупателям с доступом к курсу сразу после сохранения."
          lesson={lesson}
          lessons={lessons ?? []}
          isPending={isSaving}
          submitLabel="Сохранить"
          onSubmit={async (values) => {
            await updateLesson(values)
          }}
        />
      )}
    </RouteFocusModal>
  )
}
