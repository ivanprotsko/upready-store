import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDeleteTenantCourse, type TenantCourse } from "../../hooks/api/courses"

// t-2026-10-14-01 (panel redesign, G4, prototype state `course-delete`): «Удалить
// курс» of the list row's «…» and of the card's «…», in one place so the two
// cannot drift apart. The prompt names the course and its lessons, and asks
// for the course's title typed in (panel-ds rule 8): the lessons go with it.

/** Resolves `true` once the course is gone. */
export const useCourseDelete = (course: TenantCourse, lessonCount: number) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync } = useDeleteTenantCourse(course.id)

  return async (): Promise<boolean> => {
    const confirmed = await prompt({
      title: t("courses.deletePrompt.title", { title: course.title }),
      description: t("courses.deletePrompt.description", { count: lessonCount }),
      verificationText: course.title,
      verificationInstruction: t("general.typeToConfirm"),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) {
      return false
    }
    try {
      await mutateAsync()
      toast.success(t("courses.toast.deleted"))
      return true
    } catch (error) {
      toast.error((error as Error).message)
      return false
    }
  }
}
