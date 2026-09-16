import { Label, Select, Switch, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { HASH_ALGORITHMS, type RobokassaForm } from "../use-robokassa-form"
import type { RobokassaHashAlgorithm } from "../../../../hooks/api/payment-settings"

/**
 * How the shop BEHAVES on Robokassa: test or live payments, which hash the
 * signature uses, whether the method is offered at all
 * (p01-settings-integrations-restructure).
 *
 * This is the whole form part of «Приём оплат» now. The MerchantLogin and the
 * passwords moved to `/settings/integrations/robokassa`, and the page links
 * there instead of holding a second copy of them (rule 20).
 */
export const RobokassaBehaviourFields = ({ form }: { form: RobokassaForm }) => {
  const { t } = useTranslation()
  const { draft, update, busy } = form

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="hash_algorithm">{t("paymentSettings.fields.hash_algorithm")}</Label>
          <Select
            value={draft.hash_algorithm}
            disabled={busy}
            onValueChange={(value) => update("hash_algorithm", value as RobokassaHashAlgorithm)}
          >
            <Select.Trigger id="hash_algorithm">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {HASH_ALGORITHMS.map((algorithm) => (
                <Select.Item key={algorithm} value={algorithm}>
                  {algorithm.toUpperCase()}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="flex items-center gap-x-3 md:pt-7">
          <Switch
            id="is_test"
            checked={draft.is_test}
            disabled={busy}
            onCheckedChange={(checked) => update("is_test", checked)}
          />
          <Label htmlFor="is_test">{t("paymentSettings.fields.is_test")}</Label>
        </div>
        <div className="flex items-center gap-x-3 md:pt-7">
          <Switch
            id="is_enabled"
            checked={draft.is_enabled}
            disabled={busy}
            onCheckedChange={(checked) => update("is_enabled", checked)}
          />
          <Label htmlFor="is_enabled">{t("paymentSettings.fields.is_enabled")}</Label>
        </div>
      </div>

      <Text size="small" className="text-ui-fg-subtle">
        {t("paymentSettings.testHint")}
      </Text>
    </>
  )
}
