import { Textarea } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { SettingsEditDrawer } from "../../../../components/settings"
import { useTenantManualPayment, useUpdateTenantManualPayment } from "../../../../hooks/api/manual-payment"
import {
  contactsDraftErrors,
  contactsDraftFrom,
  contactsPayload,
  offersNothing,
} from "../../../../lib/payment-requisites"
import { MethodTextField } from "./method-text-field"

// t-2026-10-14-01 (panel redesign, G3, line us-8): the drawer of «Связаться с
// менеджером», route `/settings/payments/manual/contacts/edit`. It sends
// `contacts` alone. The checks are the backend's own patterns
// (`contactsDraftErrors`), said under the field instead of an English refusal
// in a toast; spaces and dashes in the WhatsApp number and the «@» of the
// Telegram name are dropped before the request, as the backend wants them.

const ContactsSchema = zod.object({
  whatsapp: zod.string(),
  telegram: zod.string(),
  email: zod.string(),
  note: zod.string().max(500),
})

export const ManualContactsEdit = () => {
  const { t } = useTranslation()
  const { manualPayment, isPending, isError, error } = useTenantManualPayment()
  const { mutateAsync } = useUpdateTenantManualPayment()

  if (isError) {
    throw error
  }

  const schema = ContactsSchema.superRefine((draft, ctx) => {
    for (const [field, key] of Object.entries(contactsDraftErrors(draft))) {
      ctx.addIssue({ code: "custom", path: [field], message: t(key as string) })
    }
    if (manualPayment && offersNothing({ ...manualPayment, contacts: contactsPayload(draft) })) {
      ctx.addIssue({ code: "custom", path: ["whatsapp"], message: t("paymentMethods.manual.keepOneContact") })
    }
  })

  return (
    <SettingsEditDrawer
      title={t("manualPayment.contacts.title")}
      description={t("manualPayment.contacts.hint")}
      isPending={isPending}
      schema={schema}
      defaultValues={contactsDraftFrom(manualPayment?.contacts)}
      onSubmit={(draft) => mutateAsync({ contacts: contactsPayload(draft) })}
      successMessage={t("paymentMethods.manual.contactsSaved")}
    >
      {(form) => (
        <>
          <MethodTextField
            control={form.control}
            name="whatsapp"
            label={t("manualPayment.contacts.whatsapp")}
            placeholder={t("manualPayment.contacts.whatsappPlaceholder")}
            testId="manual-contacts-whatsapp"
          />
          <MethodTextField
            control={form.control}
            name="telegram"
            label={t("manualPayment.contacts.telegram")}
            placeholder={t("manualPayment.contacts.telegramPlaceholder")}
            testId="manual-contacts-telegram"
          />
          <MethodTextField
            control={form.control}
            name="email"
            label={t("manualPayment.contacts.email")}
            testId="manual-contacts-email"
          />
          <Form.Field
            control={form.control}
            name="note"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("manualPayment.contacts.note")}</Form.Label>
                <Form.Control>
                  <Textarea
                    {...field}
                    rows={3}
                    maxLength={500}
                    placeholder={t("manualPayment.contacts.notePlaceholder")}
                    data-testid="manual-contacts-note"
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
