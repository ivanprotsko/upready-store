import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useCreateTenantLesson } from "../../../hooks/api/courses"
import { LessonForm } from "../lesson-form/lesson-form"

export const LessonNew = () => {
  const { id = "" } = useParams()
  const { mutateAsync: createLesson, isPending } = useCreateTenantLesson(id)

  return (
    <RouteFocusModal>
      <LessonForm
        heading="Новый урок"
        description="Появится последним в списке уроков курса."
        isPending={isPending}
        submitLabel="Создать"
        onSubmit={async (values) => {
          await createLesson(values)
        }}
      />
    </RouteFocusModal>
  )
}
