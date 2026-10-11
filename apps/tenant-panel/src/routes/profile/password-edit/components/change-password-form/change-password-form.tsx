import { zodResolver } from "@hookform/resolvers/zod"
import { Button, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { PasswordInput } from "../../../../../components/common/password-input"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { isFetchError } from "../../../../../lib/is-fetch-error"
import { useUpdatePassword } from "../../../../../hooks/api/users"

// o24-owner-profile (t-2026-09-24-n3): moved out of the profile card's
// standing `ChangePasswordSection` into this drawer, same fields, same
// `POST /tenants/me/password` hook. `PasswordInput` replaces `@medusajs/ui`'s
// `Input type="password"` so the eye toggle reads in Russian (acceptance
// line 5). The backend answers a wrong current password with
// `MedusaError.Types.UNAUTHORIZED` (401, `apps/backend/src/api/tenants/me/password/route.ts`);
// that one case gets a Russian inline error instead of the raw English
// `error.message` a generic toast would otherwise show.
//
// t-2026-10-09-105: `Form.ErrorMessage` prints the field error's own message
// and ignores its children, so the schema carries the translated texts itself.
// Before, a short new password read «Invalid input» (zod's default) and a
// mismatch read the bare key `profile.changePassword.passwordsDontMatch`.

const changePasswordSchema = (t: TFunction) =>
  zod
    .object({
      current_password: zod
        .string()
        .min(1, t("profile.changePassword.currentPasswordRequired")),
      new_password: zod.string().min(8, t("profile.changePassword.tooShort")),
      confirm_password: zod.string(),
    })
    .refine((data) => data.new_password === data.confirm_password, {
      path: ["confirm_password"],
      message: t("profile.changePassword.passwordsDontMatch"),
    })

type ChangePasswordFormValues = zod.infer<
  ReturnType<typeof changePasswordSchema>
>

export const ChangePasswordForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const form = useForm<ChangePasswordFormValues>({
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
    resolver: zodResolver(changePasswordSchema(t)),
  })

  const { mutateAsync, isPending } = useUpdatePassword()

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(
      {
        current_password: values.current_password,
        new_password: values.new_password,
      },
      {
        onError: (error) => {
          if (isFetchError(error) && error.status === 401) {
            form.setError("current_password", {
              type: "manual",
              message: t("profile.changePassword.currentPasswordIncorrect"),
            })
            return
          }

          toast.error(t("profile.changePassword.updateFailed"))
        },
        onSuccess: () => {
          toast.success(t("profile.toast.passwordChanged"))
          handleSuccess()
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <RouteDrawer.Body>
          <div className="flex flex-col gap-y-8">
            <Form.Field
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("profile.changePassword.currentPasswordLabel")}
                  </Form.Label>
                  <Form.Control>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("profile.changePassword.newPasswordLabel")}
                  </Form.Label>
                  <Form.Control>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("profile.changePassword.confirmPasswordLabel")}
                  </Form.Label>
                  <Form.Control>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
