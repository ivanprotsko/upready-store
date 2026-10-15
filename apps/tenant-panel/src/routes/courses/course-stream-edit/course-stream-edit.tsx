import { DatePicker, Input } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { useTenantCourse, useUpdateTenantCourse } from "../../../hooks/api/courses"
import {
  courseScheduleBody,
  dateInputValue,
  dayAsDate,
  pickedDay,
} from "../lesson-form/lesson-form-values"

// t-2026-10-14-01 (panel redesign, G4): the drawer «Поток» on
// `/courses/:id/stream/edit`. The prototype's card has no place for the
// stream's Telegram, its start and the access length (t-2026-10-13-29 stage
// 2), and nothing the owner can do today may be lost, so they are their own
// read section with this drawer (decide.mjs, task upready-store/t-2026-10-14-01).
// The start is the panel's `DatePicker` (the design system forbids the native
// date input); the day goes to the API as Moscow midnight, as before.

const WEB_URL = /^https?:\/\/\S+$/i

type StreamDraft = { channel: string; chat: string; start: Date | null; access: string }

export const CourseStreamEdit = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { course, isPending, isError, error } = useTenantCourse(id)
  const { mutateAsync } = useUpdateTenantCourse(id)

  const schema = useMemo(() => {
    const link = zod
      .string()
      .trim()
      .refine((value) => !value || WEB_URL.test(value), { message: t("courses.errors.telegram") })
    return zod.object({
      channel: link,
      chat: link,
      start: zod.date().nullable(),
      access: zod
        .string()
        .trim()
        .refine((value) => courseScheduleBody("", value).ok, { message: t("courses.errors.accessDays") }),
    })
  }, [t])

  if (isError) {
    throw error
  }

  const fields = [
    { name: "channel", label: t("courses.stream.channel") },
    { name: "chat", label: t("courses.stream.chat") },
  ] as const

  return (
    <SettingsEditDrawer<StreamDraft>
      title={t("courses.stream.title")}
      description={t("courses.stream.description")}
      isPending={isPending || !course}
      schema={schema}
      defaultValues={{
        channel: course?.telegram_channel_url ?? "",
        chat: course?.telegram_chat_url ?? "",
        start: dayAsDate(dateInputValue(course?.start_date)),
        access: course?.access_days ? String(course.access_days) : "",
      }}
      onSubmit={async (values) => {
        const schedule = courseScheduleBody(pickedDay(values.start), values.access)
        if (!schedule.ok) {
          throw new Error(t(schedule.error))
        }
        return mutateAsync({
          telegram_channel_url: values.channel.trim() || null,
          telegram_chat_url: values.chat.trim() || null,
          start_date: schedule.start_date,
          access_days: schedule.access_days,
        })
      }}
      successMessage={t("courses.toast.saved")}
    >
      {(form) => (
        <>
          {fields.map(({ name, label }) => (
            <Form.Field
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <Form.Item>
                  <Form.Label optional>{label}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" placeholder={t("courses.stream.linkPlaceholder")} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          ))}
          <Form.Field
            control={form.control}
            name="start"
            render={({ field: { value, onChange } }) => (
              <Form.Item>
                <Form.Label optional>{t("courses.stream.start")}</Form.Label>
                <Form.Control>
                  <DatePicker granularity="day" value={value} onChange={onChange} />
                </Form.Control>
                <Form.Hint>{t("courses.stream.startHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="access"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("courses.stream.access")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder={t("courses.stream.accessPlaceholder")}
                  />
                </Form.Control>
                <Form.Hint>{t("courses.stream.accessHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
