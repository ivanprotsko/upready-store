import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "../../../hooks/api/notification-settings"

// t-2026-10-14-01 (panel redesign, G1): drawer of «Письмо покупателю», the two
// fields the owner sets for the customer's letter. Route `edit`. Both are
// optional: an empty sender name falls back to the shop's name, an empty
// reply-to sends the customer's answer to the platform's address.

const emailSchema = (invalid: string) =>
  zod.object({
    email_from_name: zod.string().trim(),
    email_reply_to: zod.union([zod.literal(""), zod.string().trim().email(invalid)]),
  })

type EmailValues = zod.infer<ReturnType<typeof emailSchema>>

export const NotificationsEmailEdit = () => {
  const { t } = useTranslation()
  const { settings, shop, isPending } = useNotificationSettings()
  const { mutateAsync } = useUpdateNotificationSettings()

  return (
    <SettingsEditDrawer<EmailValues>
      title={t("notificationSettings.email.title")}
      isPending={isPending}
      schema={emailSchema(t("notificationSettings.email.replyToInvalid"))}
      defaultValues={{
        email_from_name: settings?.email.from_name ?? "",
        email_reply_to: settings?.email.reply_to ?? "",
      }}
      onSubmit={(values) => mutateAsync(values)}
      successMessage={t("notificationSettings.saved")}
    >
      {(form) => (
        <>
          <Form.Field
            control={form.control}
            name="email_from_name"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("notificationSettings.email.fromName")}</Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" placeholder={shop?.name ?? ""} />
                </Form.Control>
                <Form.Hint>{t("notificationSettings.email.fromNameHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="email_reply_to"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("notificationSettings.email.replyTo")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="off"
                    placeholder={t("notificationSettings.email.replyToPlaceholder")}
                  />
                </Form.Control>
                <Form.Hint>{t("notificationSettings.email.replyToHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}

export { NotificationsEmailEdit as Component }
