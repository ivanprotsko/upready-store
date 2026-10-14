import { Input, Select } from "@medusajs/ui"
import { useMemo } from "react"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import {
  TenantRedirect,
  useCreateTenantRedirect,
  useUpdateTenantRedirect,
} from "../../../hooks/api/redirects"
import { REDIRECT_PATH_PATTERN } from "./redirect-list"
import { REDIRECT_STATUS_CODES } from "./status-codes"

// t-2026-10-14-01 (panel redesign, G2, prototype states `redirects-create` and
// `redirects-edit`): the one form of a redirect rule, a `SettingsEditDrawer`
// on `/settings/redirects/create` and `/settings/redirects/:id/edit`. The add
// form that stood above the table and the edit inside a row both live here.
// In an edit the old address is shown and locked: it is the rule's key, and
// another key is another rule.

type RedirectDraft = { from_path: string; to_path: string; status_code: string }

type RedirectDrawerProps = {
  mode: "create" | "edit"
  /** `edit` waits for the rule; the form never mounts with blanks. */
  redirect?: TenantRedirect
  isPending?: boolean
}

const RedirectFields = ({
  form,
  editing,
}: {
  form: UseFormReturn<RedirectDraft>
  editing: boolean
}) => {
  const { t } = useTranslation()

  return (
    <>
      <Form.Field
        control={form.control}
        name="from_path"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t("redirects.columnFrom")}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                autoComplete="off"
                className="font-mono"
                placeholder={editing ? undefined : "/catalog/old-page"}
                disabled={editing}
              />
            </Form.Control>
            <Form.Hint>{editing ? t("redirects.fromLocked") : t("redirects.fromHint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="to_path"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t("redirects.columnTo")}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                autoComplete="off"
                className="font-mono"
                placeholder={editing ? undefined : "/ru/products/new-page"}
              />
            </Form.Control>
            {editing ? <Form.Hint>{t("redirects.toHint")}</Form.Hint> : null}
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <Form.Field
        control={form.control}
        name="status_code"
        render={({ field: { value, onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("redirects.columnKind")}</Form.Label>
            <Form.Control>
              <Select {...field} value={value} onValueChange={onChange}>
                <Select.Trigger ref={ref}>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {REDIRECT_STATUS_CODES.map((code) => (
                    <Select.Item key={code} value={String(code)}>
                      {t(`redirects.status.${code}`)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            <Form.Hint>{t("redirects.hint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
    </>
  )
}

export const RedirectDrawer = ({ mode, redirect, isPending = false }: RedirectDrawerProps) => {
  const { t } = useTranslation()
  const editing = mode === "edit"
  const { mutateAsync: create } = useCreateTenantRedirect()
  const { mutateAsync: update } = useUpdateTenantRedirect(redirect?.id ?? "")

  // The locked old address is sent nowhere, so an edit checks only the new one.
  const schema = useMemo(() => {
    const path = zod
      .string()
      .trim()
      .regex(REDIRECT_PATH_PATTERN, { message: t("redirects.pathError") })
    return zod
      .object({
        from_path: editing ? zod.string() : path,
        to_path: path,
        status_code: zod.string(),
      })
      .refine((draft) => draft.from_path.trim() !== draft.to_path, {
        message: t("redirects.loopError"),
        path: ["to_path"],
      })
  }, [editing, t])

  // The backend owns every other refusal (a duplicate old address); its
  // message reaches the owner through the drawer's `toast.error`.
  const handleSubmit = (draft: RedirectDraft) =>
    editing
      ? update({ to_path: draft.to_path, status_code: Number(draft.status_code) })
      : create({
          from_path: draft.from_path,
          to_path: draft.to_path,
          status_code: Number(draft.status_code),
        })

  return (
    <SettingsEditDrawer<RedirectDraft>
      title={editing ? t("redirects.edit.title") : t("redirects.create.title")}
      isPending={isPending}
      schema={schema}
      defaultValues={{
        from_path: redirect?.from_path ?? "",
        to_path: redirect?.to_path ?? "",
        status_code: String(redirect?.status_code ?? REDIRECT_STATUS_CODES[0]),
      }}
      onSubmit={handleSubmit}
      successMessage={editing ? t("redirects.saved") : t("redirects.created")}
      submitText={editing ? undefined : t("redirects.create.submit")}
    >
      {(form) => <RedirectFields form={form} editing={editing} />}
    </SettingsEditDrawer>
  )
}
