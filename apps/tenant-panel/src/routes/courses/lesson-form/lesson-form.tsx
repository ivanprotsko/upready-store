import { useId, useState, type ReactNode } from "react"
import { ArrowDownMini, ArrowUpMini, Plus, Trash } from "@medusajs/icons"
import { Button, Heading, IconButton, Input, Select, Text, Textarea, toast } from "@medusajs/ui"

import { RouteFocusModal, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import type { CreateTenantLessonBody, TenantLesson } from "../../../hooks/api/courses"
import {
  LINK_KINDS,
  emptyAttachment,
  emptyLink,
  emptyVideo,
  fromLesson,
  moveRow,
  sectionNames,
  toLessonBody,
  type LessonFormValues,
  type LinkRow,
} from "./lesson-form-values"

// o24-courses: one form for `lessons/new` and `lessons/:lessonId`, the way
// `ShippingMethodForm` serves both `shipping-create` and `shipping-edit`. Plain
// `useState` rather than react-hook-form: no cross-field validation, and
// `RouteFocusModal.Form`'s only extra is the "unsaved changes" blocker, not
// required here.
//
// t-2026-10-13-29 stage 2: the section, the list summary, the cover, the
// opening day, and lists of videos, files and links the owner adds, removes
// and reorders row by row. What the strings become on save is
// `lesson-form-values.ts`, tested on its own.

type LessonFormProps = {
  heading: string
  description: string
  lesson?: TenantLesson
  /** The course's lessons, for the section suggestions and the section's place. */
  lessons: TenantLesson[]
  isPending: boolean
  submitLabel: string
  onSubmit: (values: Omit<CreateTenantLessonBody, "order">) => Promise<void>
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    {children}
    {hint ? (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    ) : null}
  </div>
)

/** ↑, ↓ and «Убрать» of one row of a list. */
const RowActions = ({
  index,
  count,
  label,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  label: string
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) => (
  <div className="flex items-center gap-x-1">
    <IconButton
      type="button"
      size="small"
      variant="transparent"
      disabled={index === 0}
      onClick={() => onMove(-1)}
      aria-label={`${label}: выше`}
    >
      <ArrowUpMini />
    </IconButton>
    <IconButton
      type="button"
      size="small"
      variant="transparent"
      disabled={index === count - 1}
      onClick={() => onMove(1)}
      aria-label={`${label}: ниже`}
    >
      <ArrowDownMini />
    </IconButton>
    <IconButton type="button" size="small" variant="transparent" onClick={onRemove} aria-label={`${label}: убрать`}>
      <Trash />
    </IconButton>
  </div>
)

const ListBlock = ({
  title,
  hint,
  addLabel,
  onAdd,
  testId,
  children,
}: {
  title: string
  hint: string
  addLabel: string
  onAdd: () => void
  testId: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-y-2" data-testid={testId}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col">
        <Text size="small" weight="plus">
          {title}
        </Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      </div>
      <Button type="button" size="small" variant="secondary" onClick={onAdd}>
        <Plus /> {addLabel}
      </Button>
    </div>
    {children}
  </div>
)

const ROW = "flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center"

export const LessonForm = ({
  heading,
  description,
  lesson,
  lessons,
  isPending,
  submitLabel,
  onSubmit,
}: LessonFormProps) => {
  const { handleSuccess } = useRouteModal()
  const [values, setValues] = useState<LessonFormValues>(() => fromLesson(lesson))
  const sectionsListId = useId()
  const sections = sectionNames(lessons)

  const set = <K extends keyof LessonFormValues>(key: K, value: LessonFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  /** Changes one field of row `index` of a list. */
  const setRow = <K extends "videos" | "attachments" | "links">(
    key: K,
    index: number,
    patch: Partial<LessonFormValues[K][number]>
  ) =>
    setValues((current) => ({
      ...current,
      [key]: current[key].map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))

  const removeRow = (key: "videos" | "attachments" | "links", index: number) =>
    setValues((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }))

  const moveIn = (key: "videos" | "attachments" | "links", index: number, delta: -1 | 1) =>
    setValues((current) => ({ ...current, [key]: moveRow(current[key] as unknown[], index, delta) }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = toLessonBody(values, lessons, lesson?.id)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    try {
      await onSubmit(result.body)
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
          <div className="flex w-full max-w-3xl flex-col gap-y-6 px-4 sm:px-0">
            <div className="flex flex-col gap-y-4">
              <Field label="Название урока">
                <Input
                  autoFocus
                  value={values.title}
                  onChange={(event) => set("title", event.target.value)}
                  data-testid="lesson-title"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Раздел (необязательно)" hint="Уроки одного раздела идут в курсе подряд, под его заголовком.">
                  <Input
                    value={values.section}
                    onChange={(event) => set("section", event.target.value)}
                    list={sectionsListId}
                    placeholder="Подготовка"
                    data-testid="lesson-section"
                  />
                  <datalist id={sectionsListId}>
                    {sections.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Открывается на день (необязательно)" hint="Пусто — урок открыт сразу. 3 — на третий день доступа.">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={values.available_from_day}
                    onChange={(event) => set("available_from_day", event.target.value)}
                    data-testid="lesson-day"
                  />
                </Field>
              </div>
              <Field label="Описание в списке уроков (необязательно)">
                <Input
                  value={values.summary}
                  onChange={(event) => set("summary", event.target.value)}
                  placeholder="Одна строка под названием урока"
                  data-testid="lesson-summary"
                />
              </Field>
              <Field label="Обложка урока, ссылка (необязательно)">
                <Input
                  value={values.cover_url}
                  onChange={(event) => set("cover_url", event.target.value)}
                  placeholder="https://…"
                  data-testid="lesson-cover"
                />
              </Field>
            </div>

            <ListBlock
              title="Видео"
              hint="В уроке по порядку, сверху вниз. Название необязательно."
              addLabel="Добавить видео"
              onAdd={() => set("videos", [...values.videos, emptyVideo()])}
              testId="lesson-videos"
            >
              {values.videos.map((video, index) => (
                <div key={index} className={ROW}>
                  <Input
                    className="sm:flex-[2]"
                    value={video.url}
                    onChange={(event) => setRow("videos", index, { url: event.target.value })}
                    placeholder="https://… ссылка на видео"
                    aria-label={`Видео ${index + 1}: ссылка`}
                  />
                  <Input
                    className="sm:flex-1"
                    value={video.title}
                    onChange={(event) => setRow("videos", index, { title: event.target.value })}
                    placeholder="Название"
                    aria-label={`Видео ${index + 1}: название`}
                  />
                  <RowActions
                    index={index}
                    count={values.videos.length}
                    label={`Видео ${index + 1}`}
                    onMove={(delta) => moveIn("videos", index, delta)}
                    onRemove={() => removeRow("videos", index)}
                  />
                </div>
              ))}
            </ListBlock>

            <ListBlock
              title="Файлы"
              hint="Показываются под текстом урока: «Скачать «…» — PDF, 1,2 МБ»."
              addLabel="Добавить файл"
              onAdd={() => set("attachments", [...values.attachments, emptyAttachment()])}
              testId="lesson-attachments"
            >
              {values.attachments.map((file, index) => (
                <div key={index} className={ROW}>
                  <Input
                    className="sm:flex-1"
                    value={file.name}
                    onChange={(event) => setRow("attachments", index, { name: event.target.value })}
                    placeholder="Подготовительный этап.pdf"
                    aria-label={`Файл ${index + 1}: имя`}
                  />
                  <Input
                    className="sm:flex-[2]"
                    value={file.url}
                    onChange={(event) => setRow("attachments", index, { url: event.target.value })}
                    placeholder="https://… ссылка на файл"
                    aria-label={`Файл ${index + 1}: ссылка`}
                  />
                  <Input
                    className="sm:basis-1/5"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={file.size_bytes}
                    onChange={(event) => setRow("attachments", index, { size_bytes: event.target.value })}
                    placeholder="Размер, байт"
                    aria-label={`Файл ${index + 1}: размер в байтах`}
                  />
                  <RowActions
                    index={index}
                    count={values.attachments.length}
                    label={`Файл ${index + 1}`}
                    onMove={(delta) => moveIn("attachments", index, delta)}
                    onRemove={() => removeRow("attachments", index)}
                  />
                </div>
              ))}
            </ListBlock>

            <ListBlock
              title="Ссылки"
              hint="Telegram-канал и чат — кнопками, YouTube и другие — ссылкой с текстом."
              addLabel="Добавить ссылку"
              onAdd={() => set("links", [...values.links, emptyLink()])}
              testId="lesson-links"
            >
              {values.links.map((link, index) => (
                <div key={index} className={ROW}>
                  <div className="sm:basis-1/4">
                    <Select
                      value={link.kind}
                      onValueChange={(kind) => setRow("links", index, { kind: kind as LinkRow["kind"] })}
                    >
                      <Select.Trigger aria-label={`Ссылка ${index + 1}: вид`}>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {LINK_KINDS.map((kind) => (
                          <Select.Item key={kind.value} value={kind.value}>
                            {kind.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                  <Input
                    className="sm:flex-[2]"
                    value={link.url}
                    onChange={(event) => setRow("links", index, { url: event.target.value })}
                    placeholder="https://t.me/…"
                    aria-label={`Ссылка ${index + 1}: адрес`}
                  />
                  <Input
                    className="sm:flex-1"
                    value={link.title}
                    onChange={(event) => setRow("links", index, { title: event.target.value })}
                    placeholder="Текст ссылки"
                    aria-label={`Ссылка ${index + 1}: текст`}
                  />
                  <RowActions
                    index={index}
                    count={values.links.length}
                    label={`Ссылка ${index + 1}`}
                    onMove={(delta) => moveIn("links", index, delta)}
                    onRemove={() => removeRow("links", index)}
                  />
                </div>
              ))}
            </ListBlock>

            <Field label="Текст урока">
              <Textarea
                value={values.body}
                onChange={(event) => set("body", event.target.value)}
                rows={16}
                data-testid="lesson-body"
              />
            </Field>
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
