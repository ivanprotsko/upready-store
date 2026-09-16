import { Badge, Button, Label, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  useUpdateWbWriteSettings,
  useWbWriteSettings,
  type WbWriteClass,
  type WbWriteSettingsResponse,
} from "../../../../hooks/api/wb-write-settings"

/**
 * «Запись в Wildberries» — the owner's two gates (w20-wb-write-core).
 *
 * Five gates stand between this screen and a request reaching Wildberries
 * (apps/backend/src/modules/marketplace-write/execute.ts). Two of them are
 * hers and live here: the shop's write switch and a consent per operation
 * class. The other three are shown as read-only facts, so the screen never
 * suggests that flipping the switch starts sending anything:
 *
 *   - a write key in the SEPARATE `wildberries_write` slot (no shop has one),
 *   - that key not being read-only or expired,
 *   - `WB_WRITE_LIVE=1` in the backend's environment (set by no deployment).
 *
 * Every attempt, refusal and dry run is a row in the audit table below, which
 * is the evidence half: the screen's claim "nothing was sent" is checkable
 * here rather than promised.
 *
 * Design system: @medusajs/ui, like the rest of this page — the divergence
 * from the Geist canon is the one recorded in w01's report, not a new one.
 */

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

/** What the confirmation dialog says the class actually does, class by class. */
const consentNote = (
  t: (key: string, options?: Record<string, unknown>) => string,
  entry: WbWriteClass
): string =>
  t("wildberries.write.consent.note", {
    what: t(`wildberries.write.classes.${entry.op_class}.does`),
    count: entry.endpoints.length,
  })

const GateRow = ({
  label,
  open,
  detail,
}: {
  label: string
  open: boolean
  detail: string
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Badge size="2xsmall" color={open ? "orange" : "grey"}>
        {open ? t("wildberries.write.gate.open") : t("wildberries.write.gate.shut")}
      </Badge>
      <Text size="small" weight="plus">
        {label}
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        {detail}
      </Text>
    </div>
  )
}

const AuditTable = ({ audit }: { audit: WbWriteSettingsResponse["audit"] }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  if (!audit.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.write.audit.empty")}
      </Text>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[720px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("wildberries.write.audit.when")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.write.audit.what")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.write.audit.outcome")}</th>
            <th className="py-2 font-normal">{t("wildberries.write.audit.detail")}</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((row) => (
            <tr key={row.id} className="border-ui-border-base border-b last:border-b-0">
              <td className="py-2 pr-4">{formatDateTime(row.created_at, locale)}</td>
              <td className="py-2 pr-4 font-mono">
                {row.method} {row.path}
              </td>
              <td className="py-2 pr-4">
                {t(`wildberries.write.outcomes.${row.outcome}`, {
                  defaultValue: row.outcome,
                })}
              </td>
              <td className="py-2 text-ui-fg-subtle">
                {row.gate
                  ? t("wildberries.write.audit.refusedAt", {
                      gate: t(`wildberries.write.gates.${row.gate}`, {
                        defaultValue: row.gate,
                      }),
                    })
                  : (row.error ?? t("wildberries.write.audit.nothingSent"))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const WbWriteSection = () => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const { writeSettings, isPending, isError, error } = useWbWriteSettings()
  const { mutateAsync, isPending: isSaving } = useUpdateWbWriteSettings()

  if (isError) {
    throw error
  }

  const locale = i18n.language || "ru"

  // Until the load lands there is no third state to invent: the controls are
  // rendered DISABLED rather than swapped for a paragraph, so a click that
  // arrives early is not silently eaten (rule 19h).
  const loaded = Boolean(writeSettings)

  const toggleSwitch = async (checked: boolean) => {
    try {
      await mutateAsync({ is_enabled: checked })
      toast.success(
        checked
          ? t("wildberries.write.switch.onToast")
          : t("wildberries.write.switch.offToast")
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const toggleConsent = async (entry: WbWriteClass) => {
    const granted = Boolean(entry.consent)
    const className = t(`wildberries.write.classes.${entry.op_class}.title`)

    const confirmed = await prompt({
      title: granted
        ? t("wildberries.write.consent.revokeTitle", { name: className })
        : t("wildberries.write.consent.grantTitle", { name: className }),
      description: granted
        ? t("wildberries.write.consent.revokeBody", { name: className })
        : t("wildberries.write.consent.grantBody", {
            name: className,
            what: t(`wildberries.write.classes.${entry.op_class}.does`),
            methods: entry.endpoints.map((e) => `${e.method} ${e.path}`).join(", "),
          }),
      confirmText: granted
        ? t("wildberries.write.consent.revokeConfirm")
        : t("wildberries.write.consent.grantConfirm"),
      cancelText: t("wildberries.write.consent.cancel"),
    })

    if (!confirmed) {
      return
    }

    try {
      await mutateAsync({
        consents: [
          {
            op_class: entry.op_class,
            granted: !granted,
            // Kept verbatim so "what was she shown" has an answer later.
            note: granted ? undefined : consentNote(t, entry),
          },
        ],
      })
      toast.success(
        granted
          ? t("wildberries.write.consent.revokedToast", { name: className })
          : t("wildberries.write.consent.grantedToast", { name: className })
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4" data-testid="wb-write-section">
      <div>
        <Text weight="plus">{t("wildberries.write.title")}</Text>
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.write.hint")}
        </Text>
      </div>

      {isPending || !writeSettings ? (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.loading")}
        </Text>
      ) : (
        <>
          <div className="flex flex-col gap-y-2">
            <GateRow
              label={t("wildberries.write.gates.credential")}
              open={writeSettings.gates.credential.usable}
              detail={
                writeSettings.gates.credential.key.set
                  ? (writeSettings.gates.credential.reason ??
                    t("wildberries.write.gate.keyStored", {
                      slot: writeSettings.gates.credential.slot,
                      last4: writeSettings.gates.credential.key.last4,
                    }))
                  : t("wildberries.write.gate.noKey", {
                      slot: writeSettings.gates.credential.slot,
                    })
              }
            />
            <GateRow
              label={t("wildberries.write.gates.live")}
              open={writeSettings.gates.live.enabled}
              detail={
                writeSettings.gates.live.enabled
                  ? t("wildberries.write.gate.liveOn", {
                      env: writeSettings.gates.live.env_var,
                    })
                  : t("wildberries.write.gate.liveOff", {
                      env: writeSettings.gates.live.env_var,
                    })
              }
            />
          </div>

          <div className="flex items-center gap-x-3">
            <Switch
              id="wb_write_enabled"
              checked={writeSettings.is_enabled}
              disabled={!loaded || isSaving}
              onCheckedChange={toggleSwitch}
            />
            <Label htmlFor="wb_write_enabled">{t("wildberries.write.switch.label")}</Label>
          </div>

          <div className="flex flex-col gap-y-3">
            <Text size="small" weight="plus">
              {t("wildberries.write.consent.title")}
            </Text>
            {writeSettings.classes.map((entry) => (
              <div
                key={entry.op_class}
                className="border-ui-border-base flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col">
                  <Text size="small" weight="plus">
                    {t(`wildberries.write.classes.${entry.op_class}.title`)}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {t(`wildberries.write.classes.${entry.op_class}.does`)}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {entry.consent
                      ? t("wildberries.write.consent.givenAt", {
                          when: formatDateTime(entry.consent.confirmed_at, locale),
                        })
                      : t("wildberries.write.consent.notGiven")}
                  </Text>
                </div>
                <Button
                  size="small"
                  variant={entry.consent ? "secondary" : "primary"}
                  disabled={!loaded || isSaving}
                  onClick={() => toggleConsent(entry)}
                >
                  {entry.consent
                    ? t("wildberries.write.consent.revoke")
                    : t("wildberries.write.consent.grant")}
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("wildberries.write.audit.title")}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {t("wildberries.write.audit.hint")}
            </Text>
            <AuditTable audit={writeSettings.audit} />
          </div>
        </>
      )}
    </div>
  )
}
