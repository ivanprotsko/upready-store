import { zodResolver } from "@hookform/resolvers/zod"
import { EllipsisHorizontal, Trash } from "@medusajs/icons"
import { Button, Heading, IconButton, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import * as zod from "zod"

import { ActionMenu } from "../../../components/common/action-menu"
import { Form } from "../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { KeyboundForm } from "../../../components/utilities/keybound-form"
import {
  useTenantReview,
  useUpdateTenantReview,
  type TenantReview,
} from "../../../hooks/api/reviews"
import { panelLocale } from "../../../lib/panel-locale"
import { ReviewStars } from "../components/review-stars"
import { REPLY_MAX_LENGTH } from "../labels"

// t-2026-10-14-01 (panel redesign, G5, prototype states `reviews-reply`,
// `reviews-sent`): the answer to a review in its own drawer,
// /reviews/:id/reply, instead of the box that unfolded inside the row. The
// review stands above the field as a grey quote; one «Отмена / Отправить» pair
// in the footer (⌘Enter sends, a dirty Esc asks first); when an answer exists
// the button says «Сохранить» and «Удалить ответ» is in the drawer's «…». On
// success the drawer closes back to the list and a toast is the only
// confirmation.

const ReplyMenu = ({ review }: { review: TenantReview }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync, isPending } = useUpdateTenantReview(review.id)

  const removeReply = async () => {
    const confirmed = await prompt({
      title: t("reviews.deleteReply.title"),
      description: t("reviews.deleteReply.description"),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) return
    try {
      await mutateAsync({ reply: null })
      toast.success(t("reviews.toasts.replyDeleted"))
      handleSuccess()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <Trash />,
              label: t("reviews.actions.deleteReply"),
              destructive: true,
              disabled: isPending,
              onClick: () => void removeReply(),
            },
          ],
        },
      ]}
    >
      <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
        <EllipsisHorizontal />
      </IconButton>
    </ActionMenu>
  )
}

const ReviewQuote = ({ review }: { review: TenantReview }) => (
  <div className="bg-ui-bg-subtle flex flex-col gap-y-2 rounded-lg px-4 py-3" data-block="reply-quote">
    <div className="flex items-center gap-x-2">
      <ReviewStars rating={review.rating} />
      <Text size="small" leading="compact" weight="plus">
        {review.author_name}
      </Text>
    </div>
    <Text size="small" className="text-ui-fg-subtle line-clamp-4 whitespace-pre-line">
      {[review.title, review.body].filter(Boolean).join("\n")}
    </Text>
  </div>
)

const ReplyForm = ({ review }: { review: TenantReview }) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync } = useUpdateTenantReview(review.id)
  const hadReply = Boolean(review.reply)

  const schema = zod.object({
    reply: zod
      .string()
      .trim()
      .min(1, t("reviews.replyForm.required"))
      .max(REPLY_MAX_LENGTH, t("reviews.replyForm.tooLong", { max: REPLY_MAX_LENGTH })),
  })

  const form = useForm<zod.infer<typeof schema>>({
    defaultValues: { reply: review.reply ?? "" },
    resolver: zodResolver(schema),
  })

  const handleSubmit = form.handleSubmit(async ({ reply }) => {
    try {
      await mutateAsync({ reply })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("general.error"))
      return
    }
    toast.success(hadReply ? t("reviews.toasts.replySaved") : t("reviews.toasts.replySent"))
    handleSuccess()
  })

  const length = form.watch("reply").length
  const number = new Intl.NumberFormat(panelLocale())

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <ReviewQuote review={review} />
          <Form.Field
            control={form.control}
            name="reply"
            render={({ field }) => (
              <Form.Item data-block="reply-field">
                <Form.Label>{t("reviews.replyForm.label")}</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={6} maxLength={REPLY_MAX_LENGTH} autoFocus />
                </Form.Control>
                <Form.Hint>
                  {t("reviews.replyForm.counter", {
                    length: number.format(length),
                    max: number.format(REPLY_MAX_LENGTH),
                  })}
                </Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={form.formState.isSubmitting}>
              {hadReply ? t("actions.save") : t("reviews.replyForm.send")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}

export const ReviewReply = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const { review, isPending, isError, error } = useTenantReview(id!)

  if (isError) {
    throw error
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Title asChild>
            <Heading>{t("reviews.replyForm.title")}</Heading>
          </RouteDrawer.Title>
          {review?.reply ? <ReplyMenu review={review} /> : null}
        </div>
        <RouteDrawer.Description>{t("reviews.replyForm.description")}</RouteDrawer.Description>
      </RouteDrawer.Header>
      {/* The form mounts once the review is read, never with a blank answer. */}
      {isPending || !review ? null : <ReplyForm review={review} />}
    </RouteDrawer>
  )
}
