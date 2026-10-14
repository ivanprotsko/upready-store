import { PencilSquare, Trash } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"

import type { ActionGroup } from "../../../../components/common/action-menu"
import { SettingsDetail, type SettingsSection } from "../../../../components/settings"
import { useDeleteTenantTribute, useTenantTribute } from "../../../../hooks/api/tribute"
import { WAY_STATE_COLOR, storedState, wayStateKey } from "../payment-ways"
import { AddressValue } from "./address-value"
import { usePreNoticeSection } from "./payment-pre-notice-card"

/**
 * «Tribute» (t-cherk-22, part A): the shop's Tribute Shop API key. The owner
 * creates the key in the Tribute dashboard and pastes it here; the card shows
 * the webhook address to paste back into Tribute. The key comes back as
 * `{ set, last4 }` and never reaches the browser whole.
 *
 * t-2026-10-14-01 (panel redesign, G3, prototype state `payments-tribute`):
 * the card reads state → requisites → the notice before payment. The key and
 * the switch are edited in the drawer `edit`, the notice in the shared drawer
 * `pre-notice/edit`; «Удалить ключ» left the side of «Сохранить» for the last
 * group of the first «…», behind `usePrompt` (rule 8). The key comes back by
 * pasting it again, so the prompt asks no name.
 *
 * The card exists only where the backend answers `available: true`
 * (`TRIBUTE_AVAILABLE`); on the RU instance its address leads back to the
 * list, the way the old card rendered nothing there.
 */
export const TributeCard = () => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { tribute, isPending, isError, error } = useTenantTribute()
  const { mutateAsync: remove } = useDeleteTenantTribute()
  const preNotice = usePreNoticeSection("tribute")

  if (isError) {
    throw error
  }

  if (tribute && tribute.available !== true) {
    return <Navigate to="/settings/payments" replace />
  }

  const settings = tribute?.settings ?? null
  const state = storedState(settings)

  const handleRemove = async () => {
    const confirmed = await prompt({
      title: t("tribute.removeTitle"),
      description: t("tribute.removeDescription"),
      confirmText: t("tribute.remove"),
      cancelText: t("tribute.cancel"),
    })
    if (!confirmed) {
      return
    }
    try {
      await remove()
      toast.success(t("tribute.removed"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const stateActions: ActionGroup[] = [
    { actions: [{ label: t("actions.change"), to: "edit", icon: <PencilSquare /> }] },
    ...(settings
      ? [{ actions: [{ label: t("tribute.remove"), onClick: handleRemove, icon: <Trash /> }] }]
      : []),
  ]

  const stateSection: SettingsSection = {
    id: "tribute",
    title: t("paymentMethods.ways.tribute.title"),
    description: t("paymentMethods.ways.tribute.description"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    actions: stateActions,
    rows: [
      {
        id: "is_enabled",
        label: t("tribute.fields.is_enabled"),
        value: settings?.is_enabled ? t("paymentMethods.yes") : t("paymentMethods.no"),
        hint: settings?.api_key.set ? undefined : t("paymentMethods.tribute.needsKey"),
      },
    ],
  }

  const requisitesSection: SettingsSection = {
    id: "requisites",
    title: t("paymentMethods.requisites"),
    description: t("tribute.apiKeyHint"),
    editTo: "edit",
    rows: [
      {
        id: "api_key",
        label: t("paymentMethods.accessKey"),
        value: settings?.api_key.set
          ? t("paymentMethods.masked", { last4: settings.api_key.last4 ?? "" })
          : t("paymentMethods.notSet"),
      },
      {
        id: "callback_url",
        label: t("paymentMethods.tribute.webhook"),
        value: tribute?.callback_url ? (
          <AddressValue value={tribute.callback_url} testId="tribute-webhook-url" />
        ) : null,
        hint: t("tribute.webhookHint"),
      },
    ],
  }

  return (
    <SettingsDetail
      isPending={isPending || preNotice.isPending}
      sections={[stateSection, requisitesSection, preNotice.section]}
    />
  )
}
