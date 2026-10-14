import { useState } from "react"
import { ArrowDownMini, ArrowUpMini, EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Heading, IconButton, Text, clx, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu, type ActionGroup } from "../../../../components/common/action-menu"
import { NoRecords } from "../../../../components/common/empty-table-content"
import {
  type PaymentRequisite,
  type TenantManualPayment,
  useUpdateTenantManualPayment,
} from "../../../../hooks/api/manual-payment"
import {
  REQUISITES_MAX,
  initialsOf,
  maskAddress,
  maskBankNumber,
  moveItem,
  offersNothing,
} from "../../../../lib/payment-requisites"

/**
 * «Перевод по реквизитам» → «Реквизиты» (olavka-payments; t-cherk-com-hotfix
 * batch 6, Ivan 03.10: «Все в одном списке, редактирует через админку»): ONE
 * ordered list of bank items and crypto wallets, in the order the buyer sees.
 *
 * t-2026-10-14-01 (panel redesign, G3, line us-8, prototype states
 * `payments-manual` and `payments-manual-empty`): the list only reads. A row
 * is the requisite's name, its masked number and its place; «…» holds
 * «Изменить» (the drawer `requisites/:id/edit`), «Выше» / «Ниже» and, last,
 * «Удалить» behind `usePrompt` (rule 8). «Добавить банк» / «Добавить
 * криптокошелёк» open their drawers from the header; an empty list is
 * `NoRecords` with the same two buttons and no header buttons (rule 12).
 * The form under the list with «Готово / Отмена» and the card's «Сохранить»
 * are gone: a move or a removal is one request with the whole list, which is
 * what the backend replaces anyway.
 */

/** The panel's own copy of the storefront's icons (`public/payment-icons`). */
const iconUrl = (key: string) => `${import.meta.env.BASE_URL}payment-icons/${key}.png`

export const RequisiteIcon = ({
  icon,
  name,
  className,
}: {
  icon: string | null
  name: string
  className?: string
}) => {
  const [failed, setFailed] = useState(false)

  if (!icon || failed) {
    return (
      <div
        className={clx(
          "bg-ui-bg-component text-ui-fg-subtle txt-compact-xsmall-plus flex size-8 shrink-0 items-center justify-center rounded-md border border-ui-border-base",
          className
        )}
      >
        {initialsOf(name)}
      </div>
    )
  }

  return (
    <img
      src={iconUrl(icon)}
      alt=""
      className={clx(
        "size-8 shrink-0 rounded-md border border-ui-border-base bg-ui-bg-base object-contain",
        className
      )}
      onError={() => setFailed(true)}
    />
  )
}

const itemIcon = (item: PaymentRequisite): string | null =>
  item.kind === "bank" ? item.icon : item.currency.toLowerCase()

const AddButtons = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation()
  const buttons = [
    { kind: "bank", label: t("manualPayment.list.addBank") },
    { kind: "crypto", label: t("manualPayment.list.addCrypto") },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons.map(({ kind, label }) =>
        disabled ? (
          <Button key={kind} size="small" variant="secondary" disabled>
            {label}
          </Button>
        ) : (
          <Button key={kind} size="small" variant="secondary" asChild>
            <Link to={`${kind}/create`} data-testid={`manual-requisite-add-${kind}`}>
              {label}
            </Link>
          </Button>
        )
      )}
    </div>
  )
}

export const ManualRequisitesCard = ({ record }: { record: TenantManualPayment }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: save, isPending: isSaving } = useUpdateTenantManualPayment()

  const items = record.requisites

  const itemName = (item: PaymentRequisite): string =>
    item.kind === "bank"
      ? item.bank
      : `${item.currency} · ${t("paymentMethods.manual.network", { network: item.network })}`

  const itemValue = (item: PaymentRequisite): string =>
    item.kind === "bank"
      ? [maskBankNumber(item.number), item.holder ? t("paymentMethods.manual.recipient", { holder: item.holder }) : null]
          .filter(Boolean)
          .join(" · ")
      : maskAddress(item.address)

  const saveList = async (requisites: PaymentRequisite[]) => {
    try {
      await save({ requisites })
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  const handleRemove = async (index: number) => {
    const rest = items.filter((_, i) => i !== index)
    // The backend refuses transfers that are on with nothing to offer; say why before asking.
    if (offersNothing({ enabled: record.enabled, requisites: rest, contacts: record.contacts })) {
      toast.error(t("paymentMethods.manual.keepOneRequisite"))
      return
    }
    const confirmed = await prompt({
      title: t("paymentMethods.manual.removeTitle"),
      description: t("paymentMethods.manual.removeDescription", { name: itemName(items[index]) }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    })
    if (confirmed && (await saveList(rest))) {
      toast.success(t("paymentMethods.manual.removed"))
    }
  }

  const editTo = (item: PaymentRequisite) => `requisites/${encodeURIComponent(item.id ?? "")}/edit`

  const rowActions = (item: PaymentRequisite, index: number): ActionGroup[] => [
    {
      actions: [
        {
          label: t("actions.change"),
          to: editTo(item),
          icon: <PencilSquare />,
        },
      ],
    },
    {
      actions: [
        {
          label: t("manualPayment.list.moveUp"),
          onClick: () => void saveList(moveItem(items, index, -1)),
          icon: <ArrowUpMini />,
          disabled: isSaving || index === 0,
        },
        {
          label: t("manualPayment.list.moveDown"),
          onClick: () => void saveList(moveItem(items, index, 1)),
          icon: <ArrowDownMini />,
          disabled: isSaving || index === items.length - 1,
        },
      ],
    },
    {
      actions: [
        {
          label: t("actions.delete"),
          onClick: () => void handleRemove(index),
          icon: <Trash />,
          disabled: isSaving,
        },
      ],
    },
  ]

  return (
    <Container className="divide-y p-0" data-testid="settings-section-requisites">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <Heading level="h2">{t("manualPayment.list.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle text-pretty">
            {t("manualPayment.list.hint", { max: REQUISITES_MAX })}
          </Text>
        </div>
        {items.length ? <AddButtons disabled={items.length >= REQUISITES_MAX} /> : null}
      </div>

      {items.length ? (
        items.map((item, index) => (
          <div
            key={item.id ?? index}
            className="hover:bg-ui-bg-base-hover transition-fg flex items-center gap-x-3 px-6 py-3"
            data-testid={`manual-requisite-${index}`}
          >
            {/* The row opens its drawer (rule 9); «…» stays outside the link. */}
            <Link
              to={editTo(item)}
              className="focus-visible:shadow-borders-focus flex min-w-0 flex-1 items-center gap-x-3 rounded-md outline-none"
            >
              <RequisiteIcon icon={itemIcon(item)} name={itemName(item)} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Text size="small" leading="compact" weight="plus" className="truncate">
                  {itemName(item)}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  family={item.kind === "crypto" ? "mono" : "sans"}
                  className="text-ui-fg-subtle truncate"
                >
                  {itemValue(item)}
                </Text>
              </div>
            </Link>
            <Badge size="2xsmall" title={t("paymentMethods.manual.position", { n: index + 1 })}>
              {index + 1}
            </Badge>
            <ActionMenu groups={rowActions(item, index)}>
              <IconButton size="small" variant="transparent" aria-label={t("fields.actions")}>
                <EllipsisHorizontal />
              </IconButton>
            </ActionMenu>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center gap-y-4 px-6 pb-8" data-testid="manual-requisites-empty">
          <NoRecords
            title={t("paymentMethods.manual.emptyTitle")}
            message={t("paymentMethods.manual.emptyMessage")}
            className="h-auto pt-8"
          />
          <AddButtons disabled={false} />
        </div>
      )}
    </Container>
  )
}
