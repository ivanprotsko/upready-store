import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, Input, Text, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import { useCreateDomain } from "../../../../hooks/api/domains"

// t-2026-10-14-01 (panel redesign, G2): «Добавить домен» in the drawer on
// `add`. The one DNS instruction a shop owner needs (the proxy side is
// hosting-spec B4) moved in here as four steps in order, out of the page,
// where it stood in the way of everyone whose domain is long connected.

/** The CNAME target, the same one the storefront proxy answers on. */
const CNAME_TARGET = __CNAME_TARGET__ || "stores.upready.dev"

const STEPS = ["dnsStep1", "dnsStep2", "dnsStep3", "dnsStep4"] as const

const buildSchema = (empty: string) =>
  zod.object({
    host: zod.string().trim().min(1, { message: empty }),
  })

type AddValues = zod.infer<ReturnType<typeof buildSchema>>

const DomainAddForm = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync: createDomain } = useCreateDomain()

  const form = useForm<AddValues>({
    defaultValues: { host: "" },
    resolver: zodResolver(buildSchema(t("tenantAddress.hostRequired"))),
  })

  const handleSubmit = form.handleSubmit(async ({ host }) => {
    try {
      await createDomain({ host })
    } catch (error) {
      // The backend owns every refusal — a host another shop already holds, a
      // reserved shape, a name that is not a host at all — and its message is
      // what the owner reads.
      toast.error(error instanceof Error ? error.message : t("general.error"))
      return
    }

    toast.success(t("tenantAddress.domainAdded", { host }))
    handleSuccess()
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <Form.Field
            control={form.control}
            name="host"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("tenantAddress.hostLabel")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    className="font-mono"
                    placeholder={t("tenantAddress.hostPlaceholder")}
                    autoFocus
                  />
                </Form.Control>
                <Form.Hint>{t("tenantAddress.hostHint")}</Form.Hint>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />

          <div
            className="flex flex-col gap-y-2 rounded-md border border-ui-border-strong bg-ui-bg-subtle p-4"
            data-testid="domains-add-dns"
          >
            <Text size="small" weight="plus">
              {t("tenantAddress.dnsTitle")}
            </Text>
            <ol className="flex list-decimal flex-col gap-y-1 ps-5">
              {STEPS.map((key) => (
                <li key={key}>
                  <Text size="small">{t(`tenantAddress.${key}`, { target: CNAME_TARGET })}</Text>
                </li>
              ))}
            </ol>
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
              {t("tenantAddress.addDomain")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}

export const DomainAdd = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("tenantAddress.addDomainTitle")}</Heading>
        </RouteDrawer.Title>
      </RouteDrawer.Header>
      <DomainAddForm />
    </RouteDrawer>
  )
}
