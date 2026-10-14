import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Checkbox, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { RouteFocusModal, useRouteModal } from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import { useCreateSite, useSites } from "../../../../hooks/api/sites"

// t-2026-10-14-01 (panel redesign, G2): «Создать сайт», which used to stand on
// `/settings/sites` itself, is a full-screen modal on `create` (design-system
// E4: a new entity, not an edit). The fields are the ones it always had: the
// name, the platform address, the two copy flags and what is never copied.
// The new site is a copy of the site the owner is in; the source is never a
// field (`POST /tenants/sites`).

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const buildSchema = (messages: { name: string; handle: string }) =>
  zod.object({
    name: zod.string().trim().min(1, { message: messages.name }),
    handle: zod
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => value.length >= 3 && HANDLE_PATTERN.test(value), {
        message: messages.handle,
      }),
    copy_pages: zod.boolean(),
    copy_shipping: zod.boolean(),
  })

type SiteCreateValues = zod.infer<ReturnType<typeof buildSchema>>

export const SiteCreate = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { sites } = useSites()
  const { mutateAsync: createSite } = useCreateSite()

  const current = sites?.find((site) => site.is_current)
  // «.upready.dev»: what follows the handle in the current site's platform
  // address, so the field reads as the address it makes.
  const platformHost = current?.technical_hosts[0] ?? ""
  const suffix = current && platformHost.startsWith(`${current.handle}.`)
    ? platformHost.slice(current.handle.length)
    : ""

  const form = useForm<SiteCreateValues>({
    defaultValues: { name: "", handle: "", copy_pages: true, copy_shipping: true },
    resolver: zodResolver(
      buildSchema({
        name: t("sites.create.nameRequired"),
        handle: t("sites.create.handleInvalid"),
      })
    ),
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await createSite(values)
    } catch (error) {
      // The platform owns every refusal (a taken address, a reserved one).
      toast.error(error instanceof Error ? error.message : t("general.error"))
      return
    }

    toast.success(t("sites.created", { name: values.name }))
    handleSuccess()
  })

  return (
    <RouteFocusModal>
      <RouteFocusModal.Form form={form}>
        <KeyboundForm onSubmit={handleSubmit} className="flex size-full flex-col overflow-hidden">
          <RouteFocusModal.Header />
          <RouteFocusModal.Body className="flex size-full flex-col items-center overflow-auto py-16 max-md:py-8">
            <div className="flex w-full max-w-[720px] flex-col gap-y-8 px-2">
              <div>
                <RouteFocusModal.Title asChild>
                  <Heading>{t("sites.create.title")}</Heading>
                </RouteFocusModal.Title>
                <RouteFocusModal.Description asChild>
                  <Text size="small" className="text-ui-fg-subtle text-pretty">
                    {t("sites.create.description", { name: current?.name ?? "" })}
                  </Text>
                </RouteFocusModal.Description>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Field
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("sites.create.name")}</Form.Label>
                      <Form.Control>
                        <Input {...field} placeholder={t("sites.create.namePlaceholder")} />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
                <Form.Field
                  control={form.control}
                  name="handle"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t("sites.create.handle")}</Form.Label>
                      <div className="flex min-w-0 items-center gap-x-2">
                        <Form.Control>
                          <Input {...field} className="font-mono" placeholder={t("sites.create.handlePlaceholder")} />
                        </Form.Control>
                        {suffix ? (
                          <Text size="small" family="mono" className="text-ui-fg-subtle shrink-0">
                            {suffix}
                          </Text>
                        ) : null}
                      </div>
                      <Form.Hint>{t("sites.create.handleHint")}</Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )}
                />
              </div>

              <div className="flex flex-col gap-y-3">
                <Label size="small" weight="plus">
                  {t("sites.create.copyTitle")}
                </Label>
                {(["copy_pages", "copy_shipping"] as const).map((name) => (
                  <Form.Field
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field: { value, onChange, ref, ...field } }) => (
                      <Form.Item>
                        <div className="flex items-center gap-x-2">
                          <Form.Control>
                            <Checkbox
                              {...field}
                              ref={ref}
                              checked={value}
                              onCheckedChange={(checked) => onChange(checked === true)}
                            />
                          </Form.Control>
                          <Form.Label>
                            {name === "copy_pages"
                              ? t("sites.create.copyPages")
                              : t("sites.create.copyShipping")}
                          </Form.Label>
                        </div>
                      </Form.Item>
                    )}
                  />
                ))}
                <Text size="small" className="text-ui-fg-subtle text-pretty">
                  {t("sites.create.notCopied")}
                </Text>
              </div>
            </div>
          </RouteFocusModal.Body>
          <RouteFocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <RouteFocusModal.Close asChild>
                <Button size="small" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </RouteFocusModal.Close>
              <Button size="small" type="submit" isLoading={form.formState.isSubmitting}>
                {t("sites.create.submit")}
              </Button>
            </div>
          </RouteFocusModal.Footer>
        </KeyboundForm>
      </RouteFocusModal.Form>
    </RouteFocusModal>
  )
}
