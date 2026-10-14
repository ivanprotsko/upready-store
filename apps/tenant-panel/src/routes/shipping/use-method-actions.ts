import { toast, usePrompt } from "@medusajs/ui"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import {
  useDeleteShippingMethod,
  useReorderShippingMethods,
  useUpdateShippingMethod,
  type TenantShippingMethod,
} from "../../hooks/api/shipping-methods"
import { moveMethodIds } from "./labels"

// t-2026-10-14-01 (panel redesign, G2): what the row's «…» and the card's «…»
// do to one method, in one place so the two menus cannot drift apart.
// Hiding and deleting ask first, naming the method (panel-ds E6, rule 8);
// showing again and moving run at once. Every outcome is a toast (E9).

/** «Скрыть от покупателей» / «Показывать покупателям». */
export const useMethodVisibility = (method: TenantShippingMethod) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync, isPending } = useUpdateShippingMethod(method.id)

  const toggle = async () => {
    const enabled = !method.enabled
    if (!enabled) {
      const confirmed = await prompt({
        title: t("shippingMethods.hidePrompt.title"),
        description: t("shippingMethods.hidePrompt.description", { name: method.name }),
        confirmText: t("shippingMethods.hidePrompt.confirm"),
        cancelText: t("actions.cancel"),
      })
      if (!confirmed) {
        return
      }
    }
    try {
      await mutateAsync({ enabled })
      toast.success(
        enabled
          ? t("shippingMethods.toast.shown", { name: method.name })
          : t("shippingMethods.toast.hidden", { name: method.name })
      )
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return {
    label: method.enabled
      ? t("shippingMethods.actions.hide")
      : t("shippingMethods.actions.show"),
    toggle,
    isPending,
  }
}

/** «Удалить» behind a prompt; resolves `true` once the method is gone. */
export const useMethodDelete = (method: TenantShippingMethod) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync } = useDeleteShippingMethod()

  return async (): Promise<boolean> => {
    const confirmed = await prompt({
      title: t("shippingMethods.deletePrompt.title"),
      description: t("shippingMethods.deletePrompt.description", { name: method.name }),
      confirmText: t("shippingMethods.deletePrompt.confirm"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) {
      return false
    }
    try {
      await mutateAsync(method.id)
      toast.success(t("shippingMethods.toast.deleted"))
      return true
    } catch (error) {
      toast.error((error as Error).message)
      return false
    }
  }
}

/**
 * «Выше в списке» / «Ниже в списке»: the list IS the checkout order, so a move
 * sends the whole sequence to `POST /tenants/shipping-methods/reorder`.
 */
export const useMethodMove = (methods: TenantShippingMethod[]) => {
  const { t } = useTranslation()
  const { mutateAsync, isPending } = useReorderShippingMethods()

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const ids = moveMethodIds(
        methods.map((method) => method.id),
        index,
        direction
      )
      if (!ids) {
        return
      }
      try {
        await mutateAsync(ids)
        toast.success(t("shippingMethods.toast.moved"))
      } catch (error) {
        toast.error((error as Error).message)
      }
    },
    [methods, mutateAsync, t]
  )

  return { move, isPending }
}
