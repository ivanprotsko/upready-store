import { Checkbox, Input, Label, Select, Switch, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { CdekSenderMode } from "../../../../hooks/api/delivery-settings"
import { ALL_KINDS, type CdekForm } from "../use-cdek-form"

/**
 * How the shop SHIPS with CDEK: where the parcel starts, which delivery kinds
 * the checkout offers, the markup, the free-shipping threshold, test or live
 * (p01-settings-integrations-restructure).
 *
 * The account itself moved to `/settings/integrations/cdek`; the page links
 * there rather than holding a second copy of the four fields (rule 20).
 */
export const CdekBehaviourFields = ({ form }: { form: CdekForm }) => {
  const { t } = useTranslation()
  const { draft, update, toggleKind, busy } = form

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="sender_mode">{t("deliverySettings.fields.sender_mode")}</Label>
          <Select
            value={draft.sender_mode}
            disabled={busy}
            onValueChange={(value) => update("sender_mode", value as CdekSenderMode)}
          >
            <Select.Trigger id="sender_mode">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="warehouse">{t("deliverySettings.senderWarehouse")}</Select.Item>
              <Select.Item value="door">{t("deliverySettings.senderDoor")}</Select.Item>
            </Select.Content>
          </Select>
          <Text className="text-ui-fg-subtle" size="small">
            {t("deliverySettings.senderModeHint")}
          </Text>
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="sender_city_name">{t("deliverySettings.fields.sender_city_name")}</Label>
          <Input
            id="sender_city_name"
            value={draft.sender_city_name}
            disabled={busy}
            onChange={(event) => update("sender_city_name", event.target.value)}
            placeholder="Москва"
            data-testid="cdek-sender-city"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="sender_address">{t("deliverySettings.fields.sender_address")}</Label>
          <Input
            id="sender_address"
            value={draft.sender_address}
            disabled={busy}
            onChange={(event) => update("sender_address", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="shipment_point">{t("deliverySettings.fields.shipment_point")}</Label>
          <Input
            id="shipment_point"
            value={draft.shipment_point}
            disabled={busy}
            onChange={(event) => update("shipment_point", event.target.value)}
            placeholder="MSK1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="sender_name">{t("deliverySettings.fields.sender_name")}</Label>
          <Input
            id="sender_name"
            value={draft.sender_name}
            disabled={busy}
            onChange={(event) => update("sender_name", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="sender_phone">{t("deliverySettings.fields.sender_phone")}</Label>
          <Input
            id="sender_phone"
            value={draft.sender_phone}
            disabled={busy}
            onChange={(event) => update("sender_phone", event.target.value)}
            placeholder="+7…"
          />
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        <Label>{t("deliverySettings.fields.kinds")}</Label>
        <div className="flex flex-col gap-y-2">
          {ALL_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-x-2">
              <Checkbox
                checked={draft.kinds.includes(kind)}
                disabled={busy}
                onCheckedChange={(checked) => toggleKind(kind, checked === true)}
                id={`kind-${kind}`}
              />
              <Text size="small">{t(`deliverySettings.kinds.${kind}`)}</Text>
            </label>
          ))}
        </div>
        <Text className="text-ui-fg-subtle" size="small">
          {t("deliverySettings.kindsHint")}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="markup_amount">{t("deliverySettings.fields.markup_amount")}</Label>
          <Input
            id="markup_amount"
            inputMode="decimal"
            value={draft.markup_amount}
            disabled={busy}
            onChange={(event) => update("markup_amount", event.target.value)}
            data-testid="cdek-markup-amount"
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="markup_percent">{t("deliverySettings.fields.markup_percent")}</Label>
          <Input
            id="markup_percent"
            inputMode="decimal"
            value={draft.markup_percent}
            disabled={busy}
            onChange={(event) => update("markup_percent", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="free_above_total">{t("deliverySettings.fields.free_above_total")}</Label>
          <Input
            id="free_above_total"
            inputMode="decimal"
            value={draft.free_above_total}
            disabled={busy}
            onChange={(event) => update("free_above_total", event.target.value)}
            placeholder={t("deliverySettings.freeAbovePlaceholder")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <Label htmlFor="is_test">{t("deliverySettings.fields.is_test")}</Label>
            <Text className="text-ui-fg-subtle" size="small">
              {t("deliverySettings.testHint")}
            </Text>
          </div>
          <Switch
            id="is_test"
            checked={draft.is_test}
            disabled={busy}
            onCheckedChange={(checked) => update("is_test", checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="is_enabled">{t("deliverySettings.fields.is_enabled")}</Label>
          <Switch
            id="is_enabled"
            checked={draft.is_enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("is_enabled", checked)}
          />
        </div>
      </div>
    </>
  )
}
