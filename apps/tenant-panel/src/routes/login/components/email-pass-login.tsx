import { zodResolver } from "@hookform/resolvers/zod"
import type { AuthTypes } from "@medusajs/types"
import { Alert, Button, Hint, Input, Text } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { Trans, useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate } from "react-router-dom"
import * as z from "zod"

import { Form } from "../../../components/common/form"
import { PasswordInput } from "../../../components/common/password-input"
import { useSignInWithEmailPass } from "../../../hooks/api"
import { isFetchError } from "../../../lib/is-fetch-error"

const EmailPassSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

type EmailPassLoginProps = {
  onMfaChallenge?: (
    challenge: AuthTypes.AuthMfaChallengeDTO,
    onSuccess: (token: string) => void | Promise<void>
  ) => void
}

export const EmailPassLogin = ({ onMfaChallenge }: EmailPassLoginProps) => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // tenant-panel: default redirect after login is the panel's Overview ("/"),
  // not the Admin's Orders list.
  const from = location.state?.from?.pathname || "/"

  const form = useForm<z.infer<typeof EmailPassSchema>>({
    resolver: zodResolver(EmailPassSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const { mutateAsync, isPending } = useSignInWithEmailPass()

  const handleSubmit = form.handleSubmit(async ({ email, password }) => {
    await mutateAsync(
      {
        email,
        password,
      },
      {
        onError: (error) => {
          // t-2026-10-09-105: the server's own texts are English («Invalid
          // email or password», «Too many attempts. Try again in N s.»), so
          // these two answers get the panel's translated ones.
          if (isFetchError(error)) {
            if (error.status === 401) {
              form.setError("email", {
                type: "manual",
                message: t("errors.invalidCredentials"),
              })

              return
            }

            if (error.status === 429) {
              form.setError("root.serverError", {
                type: "manual",
                message: t("auth.login.tooManyAttempts"),
              })

              return
            }
          }

          form.setError("root.serverError", {
            type: "manual",
            message: error.message,
          })
        },
        onSuccess: (result) => {
          if (typeof result === "object" && "mfa_challenge" in result) {
            onMfaChallenge?.(result.mfa_challenge, () => {
              navigate(from, { replace: true })
            })
            return
          }

          navigate(from, { replace: true })
        },
      }
    )
  })

  const serverError = form.formState.errors?.root?.serverError?.message
  const validationError =
    form.formState.errors.email?.message ||
    form.formState.errors.password?.message

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-y-6">
        <div className="flex flex-col gap-y-1">
          <Form.Field
            control={form.control}
            name="email"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Control>
                    <Input
                      autoComplete="email"
                      {...field}
                      className="bg-ui-bg-field-component"
                      placeholder={t("fields.email")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="password"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{}</Form.Label>
                  <Form.Control>
                    <PasswordInput
                      autoComplete="current-password"
                      {...field}
                      className="bg-ui-bg-field-component"
                      placeholder={t("fields.password")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
        </div>
        {/* f14-no-password-reset: the panel had no way back in for an owner
            who forgot their generated 28-character password other than
            emailing a developer. */}
        <Text size="small" className="text-ui-fg-subtle text-center">
          <Trans
            i18nKey="login.forgotPassword"
            components={[<Link key="forgot-password-link" to="/forgot-password" className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover" />]}
          />
        </Text>
        {validationError && (
          <div className="text-center">
            <Hint className="inline-flex" variant={"error"}>
              {validationError}
            </Hint>
          </div>
        )}
        {serverError && (
          <Alert
            className="bg-ui-bg-base items-center p-2"
            dismissible
            variant="error"
          >
            {serverError}
          </Alert>
        )}
        <Button className="w-full" type="submit" isLoading={isPending}>
          {t("actions.continueWithEmail")}
        </Button>
      </form>
    </Form>
  )
}
