import { ArrowLongDown, ArrowLongUp, PencilSquare, Trash } from "@medusajs/icons"
import { Button, toast, usePrompt } from "@medusajs/ui"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SettingsDetailSection } from "../../../components/settings"
import {
  useDeleteTenantLesson,
  useReorderTenantLessons,
  type TenantLesson,
} from "../../../hooks/api/courses"
import { moveLessonIds } from "../lesson-form/lesson-form-values"
import { NumberedList } from "./numbered-list"

// t-2026-10-14-01 (panel redesign, G4, prototype states `course`,
// `course-lesson-menu`): «Уроки» of the course card. The rows are the order
// the buyer sees, numbered through the whole course, a section's name above
// its first lesson; under the title, what the lesson holds. «Добавить урок»
// is the header's one button; a row opens the lesson's drawer, and its «…»
// is «Изменить», «Выше / Ниже» inside the section (the drag handle it
// replaces moved a lesson only there) and «Удалить урок» behind a prompt.

/** «видео · файлов: 2 · день 3», or «текст» for a lesson of text only. */
const lessonMarks = (t: TFunction<"translation">, lesson: TenantLesson) => {
  const videos = lesson.videos?.length ?? (lesson.video_url ? 1 : 0)
  const files = lesson.attachments?.length ?? 0
  return [
    videos > 1
      ? t("courses.lessons.videos", { count: videos })
      : videos === 1
        ? t("courses.lessons.video")
        : t("courses.lessons.text"),
    files > 0 ? t("courses.lessons.files", { count: files }) : null,
    lesson.available_from_day ? t("courses.lessons.day", { day: lesson.available_from_day }) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export const CourseLessonsSection = ({
  courseId,
  lessons,
}: {
  courseId: string
  lessons: TenantLesson[]
}) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: reorder, isPending: isMoving } = useReorderTenantLessons(courseId)
  const { mutateAsync: deleteLesson } = useDeleteTenantLesson(courseId)

  const move = async (index: number, delta: -1 | 1) => {
    const ids = moveLessonIds(lessons, index, delta)
    if (!ids) {
      return
    }
    try {
      await reorder({ ids })
      toast.success(t("courses.lessons.toast.moved"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const remove = async (lesson: TenantLesson) => {
    const confirmed = await prompt({
      title: t("courses.lessons.deletePrompt.title", { title: lesson.title }),
      description: t("courses.lessons.deletePrompt.description"),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await deleteLesson(lesson.id)
      toast.success(t("courses.lessons.toast.deleted"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <SettingsDetailSection
      section={{
        id: "lessons",
        title: t("courses.lessons.title"),
        description: t("courses.lessons.description"),
        actions: [],
        action: (
          <Button size="small" variant="secondary" asChild>
            <Link to="lessons/new" data-testid="lesson-new">
              {t("courses.lessons.add")}
            </Link>
          </Button>
        ),
        rows: [],
        body: (
          <NumberedList
            items={lessons}
            getKey={(lesson) => lesson.id}
            title={(lesson) => lesson.title}
            sub={(lesson) => lessonMarks(t, lesson)}
            group={(lesson) => lesson.section?.trim() || null}
            to={(lesson) => `lessons/${lesson.id}`}
            actions={(lesson, index) => [
              {
                actions: [
                  { icon: <PencilSquare />, label: t("actions.change"), to: `lessons/${lesson.id}` },
                ],
              },
              {
                actions: [
                  {
                    icon: <ArrowLongUp />,
                    label: t("courses.lessons.moveUp"),
                    disabled: isMoving || !moveLessonIds(lessons, index, -1),
                    onClick: () => void move(index, -1),
                  },
                  {
                    icon: <ArrowLongDown />,
                    label: t("courses.lessons.moveDown"),
                    disabled: isMoving || !moveLessonIds(lessons, index, 1),
                    onClick: () => void move(index, 1),
                  },
                ],
              },
              {
                actions: [
                  {
                    icon: <Trash />,
                    label: t("courses.lessons.delete"),
                    destructive: true,
                    onClick: () => void remove(lesson),
                  },
                ],
              },
            ]}
            empty={{ title: t("courses.lessons.empty"), message: t("courses.lessons.emptyMessage") }}
            testId="lesson-list"
          />
        ),
      }}
    />
  )
}
