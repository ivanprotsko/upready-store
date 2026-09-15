import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, Button, Heading, Input, Text } from "@medusajs/ui"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Trans, useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import * as z from "zod"

import AvatarBox from "../../components/common/logo-box/avatar-box"
import { Form } from "../../components/common/form"
import { useGenerateResetPasswordToken, useMailStatus } from "../../hooks/api/auth"

// tenant-panel, f14-no-password-reset: request half of the reset-password
// flow the panel never had (the Admin only ever ships the pair as one
// route). `POST /auth/tenant/emailpass/reset-password` answers the same way
// whether or not the address has an account — `useMailStatus` is a
// SEPARATE, honest signal: whether this deployment can send mail AT ALL
// (`SMTP_HOST`, platform-wide). Conflating the two would either leak account
// existence (if the form only "worked" for real accounts) or lie about
// delivery (if it always claimed success on a stand with no SMTP, rule 20a).

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const ForgotPassword = () => {
  const { t, i18n } = useTranslation()
  const [submitted, setSubmitted] = useState(false)

  const { data: mailStatus, isLoading: isMailStatusLoading } = useMailStatus()

  const form = useForm<z.infer<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  })

  const { mutateAsync, isPending } = useGenerateResetPasswordToken()

  const handleSubmit = form.handleSubmit(async ({ email }) => {
    await mutateAsync(
      { email, metadata: { locale: i18n.language } },
      { onSuccess: () => setSubmitted(true) }
    )
  })

  return (
    <div className="bg-ui-bg-subtle flex min-h-dvh w-dvw items-center justify-center">
      <div className="m-4 flex w-full max-w-[280px] flex-col items-center">
        <AvatarBox />
        <div className="mb-4 flex flex-col items-center">
          <Heading>{t("resetPassword.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-center">
            {t("resetPassword.hint")}
          </Text>
        </div>
        {submitted ? (
          <div className="flex w-full flex-col items-center gap-y-4">
            <Alert variant={mailStatus?.configured ? "success" : "warning"}>
              {mailStatus?.configured
                ? t("resetPassword.successfulRequest")
                : t("resetPassword.mailNotConfigured", {
                    email: mailStatus?.contact_email,
                  })}
            </Alert>
            <Text size="small" className="text-ui-fg-subtle text-center">
              <Trans
                i18nKey="resetPassword.backToLogin"
                components={[<Link key="back-to-login-link" to="/login" className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover" />]}
              />
            </Text>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-y-6">
              {!isMailStatusLoading && !mailStatus?.configured && (
                <Alert variant="warning">
                  {t("resetPassword.mailNotConfigured", {
                    email: mailStatus?.contact_email,
                  })}
                </Alert>
              )}
              <Form.Field
                control={form.control}
                name="email"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Control>
                      <Input
                        autoComplete="email"
                        {...field}
                        className="bg-ui-bg-field-component"
                        placeholder={t("resetPassword.email")}
                      />
                    </Form.Control>
                  </Form.Item>
                )}
              />
              <Button className="w-full" type="submit" isLoading={isPending}>
                {t("resetPassword.sendResetInstructions")}
              </Button>
              <Text size="small" className="text-ui-fg-subtle text-center">
                <Trans
                  i18nKey="resetPassword.backToLogin"
                  components={[<Link key="back-to-login-link" to="/login" className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover" />]}
                />
              </Text>
            </form>
          </Form>
        )}
      </div>
    </div>
  )
}
