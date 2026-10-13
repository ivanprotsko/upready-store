import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, Button, Heading, Hint, Input, Text } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { Trans, useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"
import * as z from "zod"

import { BrandMark } from "../../components/common/brand-mark"
import { Form } from "../../components/common/form"
import { isFetchError } from "../../lib/is-fetch-error"
import { useResetPasswordForEmailPass } from "../../hooks/api/auth"

// tenant-panel, f14-no-password-reset: the screen the email link from
// `subscribers/password-reset-email.ts` (`panelResetPasswordUrl`) points at.
// `token` is bearer-authenticated one-shot on the backend (Medusa's
// `auth_identity` reset token), so a stale or already-used link fails at
// `updateProvider`, not here.

const ResetPasswordSchema = z
  .object({
    new_password: z.string().min(8),
    confirm_password: z.string().min(1),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    path: ["confirm_password"],
    message: "resetPassword.passwordMismatch",
  })

export const ResetPassword = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const form = useForm<z.infer<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  })

  const { mutateAsync, isPending, isSuccess, error } = useResetPasswordForEmailPass()

  const handleSubmit = form.handleSubmit(async ({ new_password }) => {
    if (!token) {
      return
    }

    await mutateAsync({ password: new_password, token })
  })

  const serverError = isFetchError(error) ? error.message : undefined

  if (!token) {
    return (
      <div className="bg-ui-bg-subtle flex min-h-dvh w-dvw items-center justify-center">
        <div className="m-4 flex w-full max-w-[280px] flex-col items-center gap-y-4">
          <BrandMark />
          <div className="flex flex-col items-center text-center">
            <Heading>{t("resetPassword.invalidLinkTitle")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("resetPassword.invalidLinkHint")}
            </Text>
          </div>
          <Link to="/forgot-password">
            <Button variant="secondary">{t("resetPassword.goToResetPassword")}</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ui-bg-subtle flex min-h-dvh w-dvw items-center justify-center">
      <div className="m-4 flex w-full max-w-[280px] flex-col items-center">
        <BrandMark />
        <div className="mb-4 flex flex-col items-center">
          <Heading>{t("resetPassword.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-center">
            {t("resetPassword.newPasswordHint")}
          </Text>
        </div>
        {isSuccess ? (
          <div className="flex w-full flex-col items-center gap-y-4">
            <Alert variant="success">{t("resetPassword.successfulReset")}</Alert>
            <Link to="/login">
              <Button>
                <Trans
                  i18nKey="resetPassword.backToLogin"
                  components={[<span key="back-to-login-span" />]}
                />
              </Button>
            </Link>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-y-6">
              <div className="flex flex-col gap-y-1">
                <Form.Field
                  control={form.control}
                  name="new_password"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Control>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          {...field}
                          className="bg-ui-bg-field-component"
                          placeholder={t("resetPassword.newPassword")}
                        />
                      </Form.Control>
                      <Form.ErrorMessage>
                        {form.formState.errors.new_password
                          ? t("resetPassword.passwordTooShort")
                          : undefined}
                      </Form.ErrorMessage>
                    </Form.Item>
                  )}
                />
                <Form.Field
                  control={form.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Control>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          {...field}
                          className="bg-ui-bg-field-component"
                          placeholder={t("resetPassword.repeatNewPassword")}
                        />
                      </Form.Control>
                    </Form.Item>
                  )}
                />
              </div>
              {form.formState.errors.confirm_password && (
                <div className="text-center">
                  <Hint className="inline-flex" variant="error">
                    {t(form.formState.errors.confirm_password.message as string)}
                  </Hint>
                </div>
              )}
              {serverError && (
                <Alert variant="error">{serverError}</Alert>
              )}
              <Button className="w-full" type="submit" isLoading={isPending}>
                {t("resetPassword.resetPassword")}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  )
}
