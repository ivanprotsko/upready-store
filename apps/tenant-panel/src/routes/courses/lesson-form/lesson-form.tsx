import { useState } from "react"
import { Button, Heading, Input, Text, Textarea, toast } from "@medusajs/ui"

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import type { TenantLesson } from "../../../hooks/api/courses"

// o24-courses: one form for `lessons/new` and `lessons/:lessonId`, the way
// `ShippingMethodForm` serves both `shipping-create` and `shipping-edit`. Plain
// `useState` rather than react-hook-form: three fields, no cross-field
// validation, and `RouteFocusModal.Form`'s only extra is the "unsaved changes"
// blocker, not required here.

export type LessonFormValues = { title: string; body: string; video_url: string }

const fromLesson = (lesson?: TenantLesson): LessonFormValues => ({
  title: lesson?.title ?? "",
  body: lesson?.body ?? "",
  video_url: lesson?.video_url ?? "",
})

const VIDEO_URL_PATTERN = /^https?:\/\/.+/i

type LessonFormProps = {
  heading: string
  description: string
  lesson?: TenantLesson
  isPending: boolean
  submitLabel: string
  onSubmit: (values: { title: string; body: string; video_url: string | null }) => Promise<void>
}

export const LessonForm = ({
  heading,
  description,
  lesson,
  isPending,
  submitLabel,
  onSubmit,
}: LessonFormProps) => {
  const { handleSuccess } = useRouteModal()
  const [values, setValues] = useState<LessonFormValues>(() => fromLesson(lesson))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = values.title.trim()
    const videoUrl = values.video_url.trim()

    if (!title) {
      toast.error("Укажите название урока.")
      return
    }
    if (videoUrl && !VIDEO_URL_PATTERN.test(videoUrl)) {
      toast.error("Ссылка на видео должна начинаться с http:// или https://")
      return
    }

    try {
      await onSubmit({ title, body: values.body, video_url: videoUrl || null })
      handleSuccess()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Не удалось сохранить урок")
    }
  }

  return (
    <>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{heading}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              {description}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteFocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-10">
          <div className="flex w-full max-w-[720px] flex-col gap-y-4">
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Название урока
              </Text>
              <Input
                autoFocus
                value={values.title}
                onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
                data-testid="lesson-title"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Ссылка на видео (необязательно)
              </Text>
              <Input
                value={values.video_url}
                onChange={(event) => setValues((v) => ({ ...v, video_url: event.target.value }))}
                placeholder="https://…"
                data-testid="lesson-video-url"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Текст урока
              </Text>
              <Textarea
                value={values.body}
                onChange={(event) => setValues((v) => ({ ...v, body: event.target.value }))}
                rows={16}
                data-testid="lesson-body"
              />
            </div>
          </div>
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary" type="button">
                Отмена
              </Button>
            </RouteFocusModal.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="lesson-save">
              {submitLabel}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </>
  )
}
