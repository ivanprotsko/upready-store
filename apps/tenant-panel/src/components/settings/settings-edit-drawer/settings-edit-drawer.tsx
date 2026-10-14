import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Heading, toast } from "@medusajs/ui"
import { ReactNode } from "react"
import { DefaultValues, FieldValues, UseFormReturn, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { RouteDrawer, useRouteModal } from "../../modals"
import { KeyboundForm } from "../../utilities/keybound-form"

// t-2026-10-14-01 (panel redesign, stage 3, G1): the edit half of a settings
// screen, after design-system patterns E3, E5 and E9 and Medusa's
// `region-edit` / `store-edit`. It lives on the section's nested `…/edit`
// route: `RouteDrawer` (a full-screen sheet under 640 px, rule 15),
// `RouteDrawer.Form` with react-hook-form and a zod schema (it also blocks a
// dirty close), one «Отмена / Сохранить» pair in the footer, and on success
// `toast.success` and `handleSuccess()` back to the read page.

export type SettingsEditDrawerProps<TValues extends FieldValues> = {
  title: string
  description?: string
  /** The form mounts once the saved record is read, never with blanks. */
  isPending?: boolean
  schema: zod.ZodType<TValues, TValues>
  defaultValues: DefaultValues<TValues>
  /** Saves; a rejection is shown as `toast.error` with its message. */
  onSubmit: (values: TValues) => Promise<unknown>
  /**
   * The success toast. A function reads the save's answer, for a save that
   * reports what it cost (G2: «значений очищено: N»).
   */
  successMessage: string | ((result: unknown) => string)
  /** The submit's word; «Сохранить» unless the drawer creates (G2: «Добавить»). */
  submitText?: string
  children: (form: UseFormReturn<TValues>) => ReactNode
}

type SettingsEditFormProps<TValues extends FieldValues> = Omit<
  SettingsEditDrawerProps<TValues>,
  "title" | "description" | "isPending"
>

const SettingsEditForm = <TValues extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  successMessage,
  submitText,
  children,
}: SettingsEditFormProps<TValues>) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const form = useForm<TValues>({
    defaultValues,
    resolver: zodResolver(schema),
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    let result: unknown
    try {
      result = await onSubmit(values)
    } catch (error) {
      // The platform owns every refusal; its own message is what the owner reads.
      toast.error(error instanceof Error ? error.message : t("general.error"))
      return
    }

    toast.success(typeof successMessage === "function" ? successMessage(result) : successMessage)
    handleSuccess()
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          {children(form)}
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={form.formState.isSubmitting}>
              {submitText ?? t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}

export const SettingsEditDrawer = <TValues extends FieldValues>({
  title,
  description,
  isPending = false,
  ...form
}: SettingsEditDrawerProps<TValues>) => {
  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{title}</Heading>
        </RouteDrawer.Title>
        {description ? <RouteDrawer.Description>{description}</RouteDrawer.Description> : null}
      </RouteDrawer.Header>
      {isPending ? null : <SettingsEditForm {...form} />}
    </RouteDrawer>
  )
}
