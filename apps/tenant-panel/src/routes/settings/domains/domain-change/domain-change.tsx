import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Input, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import { useChangeHandle, useDomains } from "../../../../hooks/api/domains"

// t-2026-10-14-01 (panel redesign, G2): «Сменить адрес», which used to unfold
// on `/settings/domains` itself, in the drawer on `change`. The consequences
// stay in front of the owner until she presses the button, not in a help
// centre: the weeks of re-indexing are the real cost of this operation and the
// one thing she cannot discover on her own (specs/tenant-address/CANONICAL.md
// §1.2). The footer's button names the operation, «Сменить адрес», rather than
// «Сохранить»: nothing on the screen was being edited.

const WARNINGS = [
  "warningNewWorks",
  "warningOldRedirects",
  "warningReindex",
  "warningReserved",
  "warningRepeat",
] as const

const buildSchema = (current: string, messages: { empty: string; same: string }) =>
  zod.object({
    handle: zod
      .string()
      .trim()
      .toLowerCase()
      .min(1, { message: messages.empty })
      .refine((value) => value !== current, { message: messages.same }),
  })

type ChangeValues = zod.infer<ReturnType<typeof buildSchema>>

const DomainChangeForm = ({
  currentHandle,
  primaryHost,
  baseDomain,
}: {
  currentHandle: string
  primaryHost: string
  baseDomain: string
}) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync: changeHandle } = useChangeHandle()

  const form = useForm<ChangeValues>({
    defaultValues: { handle: currentHandle },
    resolver: zodResolver(
      buildSchema(currentHandle, {
        empty: t("tenantAddress.handleRequired"),
        same: t("tenantAddress.handleSame"),
      })
    ),
  })

  const handleSubmit = form.handleSubmit(async ({ handle }) => {
    let host = ""
    try {
      host = (await changeHandle({ handle })).primary_host
    } catch (error) {
      // The backend owns every refusal: a taken handle, a reserved one, a shape
      // that is not a host label.
      toast.error(error instanceof Error ? error.message : t("general.error"))
      return
    }

    toast.success(t("tenantAddress.changed", { host }))
    handleSuccess()
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <Form.Field
            control={form.control}
            name="handle"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("tenantAddress.newHandle")}</Form.Label>
                <div className="flex min-w-0 items-center gap-x-2">
                  <Form.Control>
                    <Input {...field} className="font-mono" autoFocus />
                  </Form.Control>
                  <Text size="small" family="mono" className="text-ui-fg-subtle shrink-0">
                    .{baseDomain}
                  </Text>
                </div>
                <Form.Hint>{t("tenantAddress.newHandleHint", { host: primaryHost })}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />

          <div
            className="flex flex-col gap-y-2 rounded-md border border-ui-border-strong bg-ui-bg-subtle p-4"
            data-testid="domains-change-warning"
          >
            <Text size="small" weight="plus">
              {t("tenantAddress.warningTitle")}
            </Text>
            <ul className="flex list-disc flex-col gap-y-1 ps-5">
              {WARNINGS.map((key) => (
                <li key={key}>
                  <Text size="small">{t(`tenantAddress.${key}`)}</Text>
                </li>
              ))}
            </ul>
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={form.formState.isSubmitting}>
              {t("tenantAddress.changeAction")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}

export const DomainChange = () => {
  const { t } = useTranslation()
  const {
    technical,
    primary_host: primaryHost,
    base_domain: baseDomain,
    isPending,
    isError,
    error,
  } = useDomains()

  if (isError) {
    throw error
  }

  // The handle of the platform address. A shop on its own domain edits its
  // handle just the same; the field simply is not the address search sees any
  // more.
  const currentHandle = (technical?.[0] ?? "").split(".")[0]

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("tenantAddress.changeAction")}</Heading>
        </RouteDrawer.Title>
      </RouteDrawer.Header>
      {isPending ? null : (
        <DomainChangeForm
          currentHandle={currentHandle}
          primaryHost={primaryHost ?? ""}
          baseDomain={baseDomain ?? ""}
        />
      )}
    </RouteDrawer>
  )
}
