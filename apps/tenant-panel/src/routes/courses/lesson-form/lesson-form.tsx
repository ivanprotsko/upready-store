import { useId, useState, type ReactNode } from "react"
import { ArrowDownMini, ArrowUpMini, Plus, Trash } from "@medusajs/icons"
import { Button, Heading, IconButton, Input, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteDrawer, useRouteModal } from "../../../components/modals"
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
// `useState` rather than react-hook-form: no cross-field validation.
//
// t-2026-10-13-29 stage 2: the section, the list summary, the cover, the
// opening day, and lists of videos, files and links the owner adds, removes
// and reorders row by row. What the strings become on save is
// `lesson-form-values.ts`, tested on its own.
//
// t-2026-10-14-01 (panel redesign, G4, prototype state `course-lesson-edit`;
// the lead's G4 decision): the lesson is edited in a side drawer, the list of
// lessons behind it. The prototype's three fields come first (the title, the
// video, the text); every other field of today's form follows under
// «Дополнительно», so nothing is lost. A list's rows stack, the drawer being
// narrow. One «Отмена / Сохранить» pair in the footer, the outcome a toast.

type LessonFormProps = {
  heading: string
  description: string
  lesson?: TenantLesson
  /** The course's lessons, for the section suggestions and the section's place. */
  lessons: TenantLesson[]
  isPending: boolean
  submitLabel: string
  successMessage: string
  onSubmit: (values: Omit<CreateTenantLessonBody, "order">) => Promise<void>
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" weight="plus">
      {label}
    </Text>
    {children}
    {hint ? (
      <Text size="xsmall" className="text-ui-fg-subtle text-pretty">
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
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 items-center gap-x-1">
      <IconButton
        type="button"
        size="small"
        variant="transparent"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={t("courses.lesson.rowUp", { row: label })}
      >
        <ArrowUpMini />
      </IconButton>
      <IconButton
        type="button"
        size="small"
        variant="transparent"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label={t("courses.lesson.rowDown", { row: label })}
      >
        <ArrowDownMini />
      </IconButton>
      <IconButton
        type="button"
        size="small"
        variant="transparent"
        onClick={onRemove}
        aria-label={t("courses.lesson.rowRemove", { row: label })}
      >
        <Trash />
      </IconButton>
    </div>
  )
}

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
    <div className="flex flex-col gap-y-1">
      <Text size="small" weight="plus">
        {title}
      </Text>
      <Text size="xsmall" className="text-ui-fg-subtle text-pretty">
        {hint}
      </Text>
    </div>
    {children}
    <div>
      <Button type="button" size="small" variant="secondary" onClick={onAdd}>
        <Plus /> {addLabel}
      </Button>
    </div>
  </div>
)

/** One row of a list: its main field on top, the rest and the row's buttons under it. */
const ROW = "flex flex-col gap-2 rounded-lg border p-2"
const ROW_LINE = "flex items-center gap-2"

export const LessonForm = ({
  heading,
  description,
  lesson,
  lessons,
  isPending,
  submitLabel,
  successMessage,
  onSubmit,
}: LessonFormProps) => {
  const { t } = useTranslation()
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
      toast.error(t(result.error, result.values))
      return
    }

    try {
      await onSubmit(result.body)
      toast.success(successMessage)
      handleSuccess()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : t("courses.lesson.errors.save"))
    }
  }

  return (
    <>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{heading}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description>{description}</RouteDrawer.Description>
      </RouteDrawer.Header>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <Field label={t("courses.lesson.title")}>
            <Input
              autoFocus
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              data-testid="lesson-title"
            />
          </Field>

          <ListBlock
            title={t("courses.lesson.videos")}
            hint={t("courses.lesson.videosHint")}
            addLabel={t("courses.lesson.addVideo")}
            onAdd={() => set("videos", [...values.videos, emptyVideo()])}
            testId="lesson-videos"
          >
            {values.videos.map((video, index) => {
              const number = index + 1
              return (
                <div key={index} className={ROW}>
                  <Input
                    value={video.url}
                    onChange={(event) => setRow("videos", index, { url: event.target.value })}
                    placeholder={t("courses.lesson.videoUrlPlaceholder")}
                    aria-label={t("courses.lesson.videoUrl", { number })}
                  />
                  <div className={ROW_LINE}>
                    <Input
                      className="min-w-0 flex-1"
                      value={video.title}
                      onChange={(event) => setRow("videos", index, { title: event.target.value })}
                      placeholder={t("courses.lesson.videoTitlePlaceholder")}
                      aria-label={t("courses.lesson.videoTitle", { number })}
                    />
                    <RowActions
                      index={index}
                      count={values.videos.length}
                      label={t("courses.lesson.videoRow", { number })}
                      onMove={(delta) => moveIn("videos", index, delta)}
                      onRemove={() => removeRow("videos", index)}
                    />
                  </div>
                </div>
              )
            })}
          </ListBlock>

          <Field label={t("courses.lesson.body")} hint={t("courses.lesson.bodyHint")}>
            <Textarea
              value={values.body}
              onChange={(event) => set("body", event.target.value)}
              rows={14}
              data-testid="lesson-body"
            />
          </Field>

          <div className="flex flex-col gap-y-1 border-t pt-6">
            <Heading level="h3">{t("courses.lesson.more")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("courses.lesson.moreHint")}
            </Text>
          </div>

          <Field label={t("courses.lesson.section")} hint={t("courses.lesson.sectionHint")}>
            <Input
              value={values.section}
              onChange={(event) => set("section", event.target.value)}
              list={sectionsListId}
              placeholder={t("courses.lesson.sectionPlaceholder")}
              data-testid="lesson-section"
            />
            <datalist id={sectionsListId}>
              {sections.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label={t("courses.lesson.day")} hint={t("courses.lesson.dayHint")}>
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
          <Field label={t("courses.lesson.summary")}>
            <Input
              value={values.summary}
              onChange={(event) => set("summary", event.target.value)}
              placeholder={t("courses.lesson.summaryPlaceholder")}
              data-testid="lesson-summary"
            />
          </Field>
          <Field label={t("courses.lesson.cover")}>
            <Input
              value={values.cover_url}
              onChange={(event) => set("cover_url", event.target.value)}
              placeholder={t("courses.lesson.coverPlaceholder")}
              data-testid="lesson-cover"
            />
          </Field>

          <ListBlock
            title={t("courses.lesson.files")}
            hint={t("courses.lesson.filesHint")}
            addLabel={t("courses.lesson.addFile")}
            onAdd={() => set("attachments", [...values.attachments, emptyAttachment()])}
            testId="lesson-attachments"
          >
            {values.attachments.map((file, index) => {
              const number = index + 1
              return (
                <div key={index} className={ROW}>
                  <Input
                    value={file.name}
                    onChange={(event) => setRow("attachments", index, { name: event.target.value })}
                    placeholder={t("courses.lesson.fileNamePlaceholder")}
                    aria-label={t("courses.lesson.fileName", { number })}
                  />
                  <Input
                    value={file.url}
                    onChange={(event) => setRow("attachments", index, { url: event.target.value })}
                    placeholder={t("courses.lesson.fileUrlPlaceholder")}
                    aria-label={t("courses.lesson.fileUrl", { number })}
                  />
                  <div className={ROW_LINE}>
                    <Input
                      className="min-w-0 flex-1"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={file.size_bytes}
                      onChange={(event) => setRow("attachments", index, { size_bytes: event.target.value })}
                      placeholder={t("courses.lesson.fileSizePlaceholder")}
                      aria-label={t("courses.lesson.fileSize", { number })}
                    />
                    <RowActions
                      index={index}
                      count={values.attachments.length}
                      label={t("courses.lesson.fileRow", { number })}
                      onMove={(delta) => moveIn("attachments", index, delta)}
                      onRemove={() => removeRow("attachments", index)}
                    />
                  </div>
                </div>
              )
            })}
          </ListBlock>

          <ListBlock
            title={t("courses.lesson.links")}
            hint={t("courses.lesson.linksHint")}
            addLabel={t("courses.lesson.addLink")}
            onAdd={() => set("links", [...values.links, emptyLink()])}
            testId="lesson-links"
          >
            {values.links.map((link, index) => {
              const number = index + 1
              return (
                <div key={index} className={ROW}>
                  <Input
                    value={link.url}
                    onChange={(event) => setRow("links", index, { url: event.target.value })}
                    placeholder={t("courses.stream.linkPlaceholder")}
                    aria-label={t("courses.lesson.linkUrl", { number })}
                  />
                  <Input
                    value={link.title}
                    onChange={(event) => setRow("links", index, { title: event.target.value })}
                    placeholder={t("courses.lesson.linkTitlePlaceholder")}
                    aria-label={t("courses.lesson.linkTitle", { number })}
                  />
                  <div className={ROW_LINE}>
                    <div className="min-w-0 flex-1">
                      <Select
                        value={link.kind}
                        onValueChange={(kind) => setRow("links", index, { kind: kind as LinkRow["kind"] })}
                      >
                        <Select.Trigger aria-label={t("courses.lesson.linkKind", { number })}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          {LINK_KINDS.map((kind) => (
                            <Select.Item key={kind} value={kind}>
                              {t(`courses.lesson.linkKinds.${kind}`)}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                    <RowActions
                      index={index}
                      count={values.links.length}
                      label={t("courses.lesson.linkRow", { number })}
                      onMove={(delta) => moveIn("links", index, delta)}
                      onRemove={() => removeRow("links", index)}
                    />
                  </div>
                </div>
              )
            })}
          </ListBlock>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary" type="button">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending} data-testid="lesson-save">
              {submitLabel}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </>
  )
}
