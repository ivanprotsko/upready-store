import { Eye, EyeSlash, PencilSquare, Trash } from "@medusajs/icons"
import { FetchError } from "@medusajs/js-sdk"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"

import { type ActionGroup } from "../../../components/common/action-menu"
import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import {
  SettingsDetailSection,
  type SettingsRow,
  type SettingsSection,
} from "../../../components/settings"
import {
  useShippingMethods,
  type TenantShippingMethod,
} from "../../../hooks/api/shipping-methods"
import {
  carrierLabel,
  formatAmount,
  methodZoneSummary,
  tariffKindLabel,
  tariffSummary,
} from "../labels"
import { useMethodDelete, useMethodVisibility } from "../use-method-actions"

// t-2026-10-14-01 (panel redesign, G2, prototype state `shipping-method`): the
// card of one delivery method after panel-ds E2. It only reads, from the same
// list the /shipping page reads (the place in the list comes with it), in
// three sections: «Общее», «Куда доставляете», «Цена». Every section's «…»
// opens the one existing edit modal `edit` (the form is long, E4 allows a
// modal); «Скрыть / Показывать» and «Удалить» are the last group of the first
// section's «…», behind a prompt with the method's name.

const priceRows = (
  t: TFunction<"translation">,
  method: TenantShippingMethod
): SettingsRow[] => {
  const { tariff, currency_code: currency } = method
  const kind: SettingsRow = {
    id: "price-kind",
    label: t("shippingMethods.card.price.kind"),
    value: tariffKindLabel(t, tariff.kind),
    // The starting price the shop was created with, until the owner sets hers.
    hint:
      method.tariff_source === "provisioned-default"
        ? t("shippingMethods.provisionedDefault")
        : undefined,
  }

  switch (tariff.kind) {
    case "flat":
      return [
        kind,
        {
          id: "price-amount",
          label: t("shippingMethods.card.price.amount"),
          value: tariffSummary(t, tariff, currency),
        },
      ]
    case "per_kg":
      return [
        kind,
        {
          id: "price-base",
          label: t("shippingMethods.card.price.baseAmount"),
          value: formatAmount(tariff.base_amount, currency),
        },
        {
          id: "price-per-kg",
          label: t("shippingMethods.card.price.perKg"),
          value: formatAmount(tariff.per_kg_amount, currency),
        },
        {
          id: "price-min-weight",
          label: t("shippingMethods.card.price.minWeight"),
          value: tariff.min_weight_g
            ? t("shippingMethods.card.price.minWeightValue", {
                grams: tariff.min_weight_g,
              })
            : null,
          hint: tariff.min_weight_g
            ? undefined
            : t("shippingMethods.card.price.noMinWeight"),
        },
      ]
    case "free_above":
      return [
        kind,
        {
          id: "price-amount",
          label: t("shippingMethods.card.price.amount"),
          value: formatAmount(tariff.amount, currency),
        },
        {
          id: "price-free-above",
          label: t("shippingMethods.card.price.freeAbove"),
          value: formatAmount(tariff.free_above_total, currency),
        },
      ]
  }
}

const MethodCard = ({
  method,
  place,
  total,
}: {
  method: TenantShippingMethod
  place: number
  total: number
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const visibility = useMethodVisibility(method)
  const remove = useMethodDelete(method)

  const edit: ActionGroup = {
    actions: [{ icon: <PencilSquare />, label: t("actions.change"), to: "edit" }],
  }

  const sections: SettingsSection[] = [
    {
      id: "general",
      title: method.name,
      status: method.enabled
        ? { color: "green", label: t("shippingMethods.state.shown") }
        : { color: "grey", label: t("shippingMethods.state.hidden") },
      actions: [
        edit,
        {
          actions: [
            {
              icon: method.enabled ? <EyeSlash /> : <Eye />,
              label: visibility.label,
              disabled: visibility.isPending,
              onClick: () => void visibility.toggle(),
            },
            {
              icon: <Trash />,
              label: t("actions.delete"),
              onClick: async () => {
                if (await remove()) {
                  navigate("/shipping", { replace: true })
                }
              },
            },
          ],
        },
      ],
      rows: [
        { id: "name", label: t("shippingMethods.card.name"), value: method.name },
        {
          id: "description",
          label: t("shippingMethods.card.description"),
          value: method.description,
        },
        {
          id: "delivery-time",
          label: t("shippingMethods.card.deliveryTime"),
          value: method.delivery_hint,
        },
        {
          id: "carrier",
          label: t("shippingMethods.card.carrier"),
          value: carrierLabel(t, method.carrier),
        },
        {
          id: "place",
          label: t("shippingMethods.card.place"),
          value: t("shippingMethods.card.placeValue", { place, total }),
        },
      ],
    },
    {
      id: "zone",
      title: t("shippingMethods.card.zone.title"),
      description: t("shippingMethods.card.zone.description"),
      actions: [edit],
      rows: [
        {
          id: "zone",
          label: t("shippingMethods.card.zone.label"),
          value: methodZoneSummary(t, method),
        },
      ],
    },
    {
      id: "price",
      title: t("shippingMethods.card.price.title"),
      description: t("shippingMethods.card.price.description"),
      actions: [edit],
      rows: priceRows(t, method),
    },
  ]

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} data={method} hasOutlet>
      {sections.map((section, index) => (
        // The method's name is the screen's own title (E11): h1 there only.
        <SettingsDetailSection
          key={section.id}
          section={section}
          level={index === 0 ? "h1" : "h2"}
        />
      ))}
    </SingleColumnPage>
  )
}

export const ShippingDetail = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { methods, isPending, isError, error } = useShippingMethods()

  if (isError) {
    throw error
  }

  if (isPending || !methods) {
    return <SingleColumnPageSkeleton sections={3} />
  }

  const index = methods.findIndex((method) => method.id === id)
  if (index === -1) {
    // A deleted method or a mistyped address reads «not found», like any card.
    throw new FetchError(t("shippingMethods.card.notFound"), "Not Found", 404)
  }

  return <MethodCard method={methods[index]} place={index + 1} total={methods.length} />
}
