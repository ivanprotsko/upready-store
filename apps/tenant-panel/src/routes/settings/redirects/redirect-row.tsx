import { useState } from "react"
import { Check, PencilSquare, Trash, XMark } from "@medusajs/icons"
import { Button, IconButton, Input, Select, Table, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  TenantRedirect,
  useDeleteTenantRedirect,
  useUpdateTenantRedirect,
} from "../../../hooks/api/redirects"
import { REDIRECT_STATUS_CODES } from "./status-codes"

// b10-panel-gaps: one rule of the redirect table. Its own component because the
// edit draft, the delete confirmation and two busy flags are state this row
// alone needs (the same split `routes/pages/page-list/custom-page-row.tsx` made).

type RedirectRowProps = {
  redirect: TenantRedirect
  /** The shop's main address, so the row shows the full old URL, not a path. */
  primaryHost?: string
}

export const RedirectRow = ({ redirect, primaryHost }: RedirectRowProps) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toPath, setToPath] = useState(redirect.to_path)
  const [statusCode, setStatusCode] = useState(String(redirect.status_code))

  const { mutateAsync: update, isPending: isSaving } = useUpdateTenantRedirect(redirect.id)
  const { mutateAsync: remove, isPending: isDeleting } = useDeleteTenantRedirect(redirect.id)

  const statusLabel = (code: number) =>
    t(`redirects.status.${code}`, { defaultValue: String(code) })

  const startEditing = () => {
    setToPath(redirect.to_path)
    setStatusCode(String(redirect.status_code))
    setEditing(true)
  }

  const handleSave = async () => {
    const value = toPath.trim()

    if (!value.startsWith("/")) {
      toast.error(t("redirects.pathError"))
      return
    }

    await update(
      { to_path: value, status_code: Number(statusCode) },
      {
        onSuccess: () => {
          setEditing(false)
          toast.success(t("redirects.saved"))
        },
        onError: (saveError) => toast.error(saveError.message),
      }
    )
  }

  return (
    <Table.Row>
      <Table.Cell title={primaryHost ? `${primaryHost}${redirect.from_path}` : undefined}>
        <Text size="small" className="font-mono truncate">
          {redirect.from_path}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {editing ? (
          <Input
            value={toPath}
            onChange={(event) => setToPath(event.target.value)}
            className="font-mono w-[280px]"
            autoFocus
          />
        ) : (
          <Text size="small" className="font-mono">
            {redirect.to_path}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        {editing ? (
          <Select value={statusCode} onValueChange={setStatusCode}>
            <Select.Trigger className="w-[220px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {REDIRECT_STATUS_CODES.map((code) => (
                <Select.Item key={code} value={String(code)}>
                  {statusLabel(code)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {statusLabel(redirect.status_code)}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        {editing ? (
          <div className="flex items-center gap-x-1">
            <IconButton
              size="small"
              variant="transparent"
              isLoading={isSaving}
              onClick={handleSave}
              aria-label={t("redirects.saveAction")}
            >
              <Check />
            </IconButton>
            <IconButton
              size="small"
              variant="transparent"
              onClick={() => setEditing(false)}
              aria-label={t("redirects.cancel")}
            >
              <XMark />
            </IconButton>
          </div>
        ) : confirming ? (
          <div className="flex items-center gap-x-1">
            <Button
              size="small"
              variant="danger"
              isLoading={isDeleting}
              onClick={() =>
                remove(undefined, {
                  onSuccess: () => toast.success(t("redirects.removed")),
                  onError: (removeError) => toast.error(removeError.message),
                })
              }
            >
              {t("redirects.deleteConfirm")}
            </Button>
            <Button size="small" variant="secondary" onClick={() => setConfirming(false)}>
              {t("redirects.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-x-1">
            <IconButton
              size="small"
              variant="transparent"
              onClick={startEditing}
              aria-label={t("redirects.editAction")}
            >
              <PencilSquare />
            </IconButton>
            <IconButton
              size="small"
              variant="transparent"
              onClick={() => setConfirming(true)}
              aria-label={t("redirects.deleteAction")}
            >
              <Trash />
            </IconButton>
          </div>
        )}
      </Table.Cell>
    </Table.Row>
  )
}
