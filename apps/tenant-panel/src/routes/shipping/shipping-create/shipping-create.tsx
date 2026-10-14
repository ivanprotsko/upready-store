import { Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteFocusModal } from "../../../components/modals"
import {
  useCreateShippingMethod,
  useShippingMethods,
} from "../../../hooks/api/shipping-methods"
import { ShippingMethodForm } from "../components/shipping-method-form/shipping-method-form"

export const ShippingCreate = () => {
  const { t } = useTranslation()
  const { settings } = useShippingMethods()
  const { mutateAsync, isPending } = useCreateShippingMethod()

  return (
    <RouteFocusModal>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{t("shippingMethods.form.createTitle")}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              {t("shippingMethods.form.createDescription")}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      <ShippingMethodForm
        currencyCode={settings?.currency_code ?? "rub"}
        isPending={isPending}
        onSubmit={async (body) => {
          await mutateAsync(body)
        }}
      />
    </RouteFocusModal>
  )
}
