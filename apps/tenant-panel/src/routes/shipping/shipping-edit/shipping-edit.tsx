import { Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import {
  useShippingMethod,
  useUpdateShippingMethod,
} from "../../../hooks/api/shipping-methods"
import { ShippingMethodForm } from "../components/shipping-method-form/shipping-method-form"

// t-2026-10-14-01 (panel redesign, G2): the one edit of a method, a child of
// its card since the redesign, so «Отмена» and «Сохранить» return to the card.
// Every section's «…» on the card and «Изменить» in the list's row open it.

export const ShippingEdit = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { method, isPending, isError, error } = useShippingMethod(id)
  const { mutateAsync, isPending: isSaving } = useUpdateShippingMethod(id)

  if (isError) {
    throw error
  }

  return (
    <RouteFocusModal>
      <RouteFocusModal.Header>
        <div className="flex flex-1 flex-col items-start">
          <RouteFocusModal.Title asChild>
            <Heading>{method?.name ?? t("shippingMethods.form.editTitle")}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              {t("shippingMethods.form.editDescription")}
            </Text>
          </RouteFocusModal.Description>
        </div>
      </RouteFocusModal.Header>
      {!isPending && method ? (
        <ShippingMethodForm
          method={method}
          currencyCode={method.currency_code}
          isPending={isSaving}
          onSubmit={async (body) => {
            await mutateAsync(body)
          }}
        />
      ) : null}
    </RouteFocusModal>
  )
}
