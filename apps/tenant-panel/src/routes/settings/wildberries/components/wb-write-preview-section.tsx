import { Badge, Button, Select, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  useWbWritePreview,
  type WbDiffKind,
} from "../../../../hooks/api/wb-write-preview"
import { useWbWriteSettings } from "../../../../hooks/api/wb-write-settings"
import { WbDiffTable } from "./wb-diff-table"
import { WbWarehouseMapping } from "./wb-warehouse-mapping"

/**
 * «Что изменится на WB» — the preview of the store -> Wildberries diff for the
 * two classes whose source of truth is ours (w21-wb-write-stocks-prices).
 *
 * The table is the point: the owner sees what a push WOULD carry, per product,
 * with the shop's number and WB's number side by side, BEFORE anybody has the
 * right to send it. «Отправить» is therefore disabled, and the screen lists
 * WHICH gates are shut instead of just being grey — the gates themselves live
 * in the backend (`modules/marketplace-write/execute.ts`) and none of them can
 * be opened from this panel.
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

export const WbWritePreviewSection = () => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"
  const [kind, setKind] = useState<WbDiffKind>("stocks")

  const { preview, isPending, isError, error } = useWbWritePreview({ kind })
  const { writeSettings } = useWbWriteSettings()

  if (isError) {
    throw error
  }

  const consent = writeSettings?.classes.find((entry) => entry.op_class === kind)

  // Every line here is read back from the server, never assumed: the button is
  // disabled because of a named, checkable fact (rule 20a).
  const shutGates: string[] = []
  if (preview && !preview.gates.live.enabled) {
    shutGates.push(t("wildberries.preview.gates.live", { env: preview.gates.live.env_var }))
  }
  if (writeSettings && !writeSettings.gates.credential.usable) {
    shutGates.push(
      t("wildberries.preview.gates.credential", {
        slot: writeSettings.gates.credential.slot,
      })
    )
  }
  if (writeSettings && !writeSettings.is_enabled) {
    shutGates.push(t("wildberries.preview.gates.switch"))
  }
  if (writeSettings && !consent?.consent) {
    shutGates.push(
      t("wildberries.preview.gates.consent", {
        name: t(`wildberries.write.classes.${kind}.title`),
      })
    )
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4" data-testid="wb-write-preview-section">
      <div>
        <Text weight="plus">{t("wildberries.preview.title")}</Text>
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.preview.hint")}
        </Text>
      </div>

      <div className="min-w-[220px] max-w-[320px]">
        <Select value={kind} onValueChange={(value) => setKind(value as WbDiffKind)}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="stocks">
              {t("wildberries.write.classes.stocks.title")}
            </Select.Item>
            <Select.Item value="prices">
              {t("wildberries.write.classes.prices.title")}
            </Select.Item>
          </Select.Content>
        </Select>
      </div>

      {isPending || !preview ? (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.loading")}
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Badge size="2xsmall" color="orange">
              {t("wildberries.preview.counts.update", { count: preview.counts.update })}
            </Badge>
            <Badge size="2xsmall" color="green">
              {t("wildberries.preview.counts.equal", { count: preview.counts.equal })}
            </Badge>
            <Badge size="2xsmall" color="grey">
              {t("wildberries.preview.counts.skipped", { count: preview.counts.skipped })}
            </Badge>
            <Text size="small" className="text-ui-fg-subtle">
              {t("wildberries.preview.mirrorRead", {
                when: formatDateTime(preview.mirror_fetched_at, locale),
              })}
            </Text>
          </div>

          {kind === "stocks" ? <WbWarehouseMapping preview={preview} /> : null}

          <WbDiffTable kind={kind} rows={preview.rows} locale={locale} />

          <div className="flex flex-col gap-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button size="small" variant="primary" disabled>
                {t("wildberries.preview.send", {
                  batches: preview.push.batches,
                  rows: preview.push.rows,
                })}
              </Button>
              <Text size="small" className="text-ui-fg-subtle">
                {t("wildberries.preview.sendHint")}
              </Text>
            </div>
            {shutGates.length ? (
              <ul className="text-ui-fg-subtle txt-compact-small list-disc pl-5">
                {shutGates.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                {t("wildberries.preview.gates.allOpen")}
              </Text>
            )}
          </div>
        </>
      )}
    </div>
  )
}
