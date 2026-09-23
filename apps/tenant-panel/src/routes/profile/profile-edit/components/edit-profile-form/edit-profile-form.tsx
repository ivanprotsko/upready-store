import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Input, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
// tenant-panel: `TenantAdmin` instead of the Admin's `HttpTypes.AdminUser`.
import { TenantAdmin, useUpdateUser } from "../../../../../hooks/api/users"

type EditProfileProps = {
  user: TenantAdmin
  // usageInsights: boolean
}

const EditProfileSchema = zod.object({
  first_name: zod.string().optional(),
  last_name: zod.string().optional(),
  // usage_insights: zod.boolean(),
})

// o24-owner-profile (t-2026-09-24-n3): the language field that used to live
// here moved into `ProfileGeneralSection`'s «Язык» row (Ivan's own words —
// he wants the select right where the value sits, not behind this drawer).
// This drawer stays for the name fields only, so there is exactly one place
// that changes the language.
export const EditProfileForm = ({ user }: EditProfileProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const form = useForm<zod.infer<typeof EditProfileSchema>>({
    defaultValues: {
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      // usage_insights: usageInsights,
    },
    resolver: zodResolver(EditProfileSchema),
  })

  // tenant-panel: `useUpdateUser()` takes no id — `POST /tenants/me` always
  // updates the caller behind the bearer token (docs/tenant-panel/api-contract.md,
  // "Piece 4: profile"). The Admin calls `useUpdateUser(user.id!)` here.
  const { mutateAsync, isPending } = useUpdateUser()

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(
      {
        first_name: values.first_name,
        last_name: values.last_name,
      },
      {
        onError: (error) => {
          toast.error(error.message)
          return
        },
        onSuccess: () => {
          toast.success(t("profile.toast.edit"))
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
            <div className="grid grid-cols-2 gap-4">
              <Form.Field
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t("fields.firstName")}</Form.Label>
                    <Form.Control>
                      <Input {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              <Form.Field
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t("fields.lastName")}</Form.Label>
                    <Form.Control>
                      <Input {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
            </div>
            {/* TODO: Do we want to implement usage insights in V2? */}
            {/* <Form.Field
              control={form.control}
              name="usage_insights"
              render={({ field: { value, onChange, ...rest } }) => (
                <Form.Item>
                  <div className="flex items-center justify-between">
                    <Form.Label>
                      {t("profile.fields.usageInsightsLabel")}
                    </Form.Label>
                    <Form.Control>
                      <Switch dir="ltr"
                        className="rtl:rotate-180"
                        {...rest}
                        checked={value}
                        onCheckedChange={onChange}
                      />
                    </Form.Control>
                  </div>
                  <Form.Hint>
                    <span>
                      <Trans
                        i18nKey="profile.edit.usageInsightsHint"
                        components={[
                          <a
                            key="hint-link"
                            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover transition-fg underline"
                            href="https://docs.medusajs.com/resources/usage#admin-analytics"
                            target="_blank"
                            rel="noopener noreferrer"
                          />,
                        ]}
                      />
                    </span>
                  </Form.Hint>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            /> */}
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
