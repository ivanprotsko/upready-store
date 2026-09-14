import { Heading, Text } from "@medusajs/ui"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import {
  useShippingMethod,
  useUpdateShippingMethod,
} from "../../../hooks/api/shipping-methods"
import { ShippingMethodForm } from "../components/shipping-method-form/shipping-method-form"

export const ShippingEdit = () => {
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
            <Heading>{method?.name ?? "Способ доставки"}</Heading>
          </RouteFocusModal.Title>
          <RouteFocusModal.Description asChild>
            <Text size="small" className="text-ui-fg-subtle">
              Изменения видны покупателям сразу после сохранения.
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
