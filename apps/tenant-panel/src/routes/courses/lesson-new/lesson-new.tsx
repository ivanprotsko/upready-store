import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useCreateTenantLesson, useTenantCourse } from "../../../hooks/api/courses"
import { LessonForm } from "../lesson-form/lesson-form"

export const LessonNew = () => {
  const { id = "" } = useParams()
  const { mutateAsync: createLesson, isPending } = useCreateTenantLesson(id)
  // The course page has already loaded it; the sections suggested in the form come from here.
  const { lessons } = useTenantCourse(id)

  return (
    <RouteFocusModal>
      <LessonForm
        heading="Новый урок"
        description="Появится последним в списке уроков курса."
        lessons={lessons ?? []}
        isPending={isPending}
        submitLabel="Создать"
        onSubmit={async (values) => {
          await createLesson(values)
        }}
      />
    </RouteFocusModal>
  )
}
