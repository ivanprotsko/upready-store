import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { useUpdatePassword } from "../../../../../hooks/api/users"

// tenant-panel wave 2, piece 4: own component, no Admin counterpart (the
// Admin only ever changes a password through the unauthenticated
// reset-password link flow). This panel has its own separate reset-password
// flow too (`routes/forgot-password`, `routes/reset-password`,
// f14-no-password-reset), for a tenant admin who is not logged in at all;
// this section stays for one who is, and wants the current-password check
// the unauthenticated flow does not have. Uses the same Form/Input/Button
// primitives and toast pattern as the copied `edit-profile-form`, posting to
// `POST /tenants/me/password` (docs/tenant-panel/api-contract.md,
// "Piece 4: profile").

const ChangePasswordSchema = zod
  .object({
    current_password: zod.string().min(1),
    new_password: zod.string().min(8),
    confirm_password: zod.string().min(1),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    path: ["confirm_password"],
    message: "profile.changePassword.passwordsDontMatch",
  })

type ChangePasswordFormValues = zod.infer<typeof ChangePasswordSchema>

export const ChangePasswordSection = () => {
  const { t } = useTranslation()

  const form = useForm<ChangePasswordFormValues>({
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
    resolver: zodResolver(ChangePasswordSchema),
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
          toast.error(error.message)
        },
        onSuccess: () => {
          toast.success(t("profile.toast.passwordChanged"))
          form.reset()
        },
      }
    )
  })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("profile.changePassword.title")}</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          {t("profile.changePassword.description")}
        </Text>
      </div>
      <Form {...form}>
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Field
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("profile.changePassword.currentPasswordLabel")}
                  </Form.Label>
                  <Form.Control>
                    <Input type="password" autoComplete="current-password" {...field} />
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
                    <Input type="password" autoComplete="new-password" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage>
                    {form.formState.errors.new_password
                      ? t("profile.changePassword.tooShort")
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
                  <Form.Label>
                    {t("profile.changePassword.confirmPasswordLabel")}
                  </Form.Label>
                  <Form.Control>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage>
                    {form.formState.errors.confirm_password
                      ? t("profile.changePassword.passwordsDontMatch")
                      : undefined}
                  </Form.ErrorMessage>
                </Form.Item>
              )}
            />
          </div>
          <div className="flex justify-end pt-4">
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </form>
      </Form>
    </Container>
  )
}
