import { Badge, Button, Checkbox, Select, Text, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  useWbFbsAction,
  useWbFbsOrders,
  type WbFbsActionResponse,
  type WbFbsSupply,
} from "../../../../hooks/api/wb-fbs-orders"
import { WbFbsResult } from "./wb-fbs-result"
import { WbFbsStatusCell } from "./wb-fbs-status-cell"

/**
 * «Заказы FBS» — the desk (w23-wb-write-fbs-orders).
 *
 * Reads our mirror of the cabinet (`wb_fbs_order`, `wb_supply`) and offers the
 * three actions Wildberries actually has for an assembly order. It offers
 * nothing else, and none of them where WB's own status table says the
 * transition does not exist: the reason a button is unavailable comes from the
 * backend, from the same module the action itself goes through, so the button
 * and the refusal can never disagree.
 *
 * What the screen must never suggest is that pressing a button sends something
 * today. Five gates stand between it and Wildberries
 * (apps/backend/src/modules/marketplace-write/execute.ts), three of them shut
 * in every deployment, so every answer is a DRY RUN — and the result panel
 * says so with the journal row's own words rather than with a promise.
 *
 * Design system: @medusajs/ui, like the rest of this panel. The panel is a
 * copy of Medusa Admin 2.19 and its divergence from the Geist canon is the one
 * w01 recorded, not a new one (rule 27).
 */

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

const formatMoney = (value: number | null, locale: string): string =>
  value === null
    ? NOT_SET
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 2,
      }).format(value)

export const WbFbsSection = () => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const locale = i18n.language || "ru"

  const [filter, setFilter] = useState("new")
  const [selected, setSelected] = useState<string[]>([])
  const [supplyId, setSupplyId] = useState<string>("")
  const [result, setResult] = useState<WbFbsActionResponse | null>(null)

  const { desk, isPending, isError, error } = useWbFbsOrders(filter)
  const { mutateAsync, isPending: isActing } = useWbFbsAction()

  if (isError) {
    throw error
  }

  // Until the load lands the controls are rendered DISABLED rather than
  // swapped for a paragraph, so a click that arrives early is not silently
  // eaten (rule 19h).
  const loaded = Boolean(desk)

  const orders = desk?.orders ?? []
  const supplies = desk?.supplies ?? []
  const chosen = orders.filter((order) => selected.includes(order.order_id))
  const supply = supplies.find((item) => item.supply_id === supplyId) ?? null

  const switchFilter = (next: string) => {
    setFilter(next)
    // The selection belongs to the list that produced it: keeping ids across a
    // filter change would leave the action bar acting on rows nobody can see.
    setSelected([])
    setResult(null)
  }

  const toggle = (orderId: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, orderId] : current.filter((id) => id !== orderId)
    )

  const runAction = async (
    action: "assemble" | "cancel" | "deliver",
    dialog: { title: string; description: string; confirmText: string },
    forSupply?: string
  ) => {
    const confirmed = await prompt({
      title: dialog.title,
      description: dialog.description,
      confirmText: dialog.confirmText,
      cancelText: t("wildberries.write.consent.cancel"),
    })

    if (!confirmed) {
      return
    }

    try {
      const answer = await mutateAsync({
        action,
        order_ids: action === "deliver" ? undefined : chosen.map((order) => order.order_id),
        // «Отменить» touches no supply; the other two take the one the owner
        // chose, and «Передать в доставку» takes the row she pressed — never
        // the select's value, which she may not have touched at all.
        supply_id:
          action === "cancel" ? undefined : (forSupply ?? (supplyId || null)),
      })
      setResult(answer)
      toast.success(
        answer.dry_run
          ? t("wildberries.fbs.result.dryRunToast")
          : t("wildberries.fbs.result.sentToast")
      )
    } catch (err) {
      setResult(null)
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const assembleBlocked = chosen.filter((order) => order.assemble_refusal)
  const cancelBlocked = chosen.filter((order) => order.cancel_refusal)

  const assemble = () =>
    runAction("assemble", {
      title: t("wildberries.fbs.assemble.title", { count: chosen.length }),
      description: supply
        ? t("wildberries.fbs.assemble.intoSupply", {
            count: chosen.length,
            supply: supply.name ?? supply.supply_id,
          })
        : t("wildberries.fbs.assemble.newSupply", { count: chosen.length }),
      confirmText: t("wildberries.fbs.assemble.confirm"),
    })

  const cancel = () =>
    runAction("cancel", {
      title: t("wildberries.fbs.cancel.title", { count: chosen.length }),
      description: t("wildberries.fbs.cancel.body", {
        count: chosen.length,
        orders: chosen.map((order) => order.order_id).join(", "),
      }),
      confirmText: t("wildberries.fbs.cancel.confirm"),
    })

  const deliver = (item: WbFbsSupply) =>
    runAction(
      "deliver",
      {
        title: t("wildberries.fbs.deliver.title", { supply: item.name ?? item.supply_id }),
        // WB calls this one irreversible: a closed supply takes no more orders.
        description: t("wildberries.fbs.deliver.body", {
          supply: item.name ?? item.supply_id,
          count: item.orders,
        }),
        confirmText: t("wildberries.fbs.deliver.confirm"),
      },
      item.supply_id
    )

  return (
    <div className="flex flex-col gap-y-5 px-6 py-4" data-testid="wb-fbs-section">
      <div>
        <Text weight="plus">{t("wildberries.fbs.title")}</Text>
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.fbs.hint")}
        </Text>
      </div>

      {isPending || !desk ? (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.loading")}
        </Text>
      ) : (
        <>
          <div className="flex flex-col gap-y-1">
            {desk.sync.map((run) => (
              <Text key={run.kind} size="small" className="text-ui-fg-subtle">
                {t("wildberries.fbs.sync.line", {
                  kind: t(`wildberries.kinds.${run.kind}`, { defaultValue: run.kind }),
                  status: run.status
                    ? t(`wildberries.statuses.${run.status}`, { defaultValue: run.status })
                    : t("wildberries.sync.never"),
                  rows: run.rows,
                  when: formatDateTime(run.finished_at, locale),
                })}
              </Text>
            ))}
            <Text size="small" className="text-ui-fg-subtle">
              {t("wildberries.fbs.sync.howTo")}
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {desk.filters.map((name) => (
              <Button
                key={name}
                size="small"
                variant={filter === name ? "primary" : "secondary"}
                disabled={!loaded || isActing}
                onClick={() => switchFilter(name)}
              >
                {t(`wildberries.fbs.filters.${name}`, { defaultValue: name })}
                {name === "all" ? "" : ` · ${desk.counts[name] ?? 0}`}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="txt-compact-small w-full min-w-[900px] text-left">
              <thead className="text-ui-fg-subtle">
                <tr className="border-ui-border-base border-b">
                  <th className="w-8 py-2 pr-2 font-normal" />
                  <th className="py-2 pr-4 font-normal">{t("wildberries.fbs.columns.order")}</th>
                  <th className="py-2 pr-4 font-normal">{t("wildberries.fbs.columns.created")}</th>
                  <th className="py-2 pr-4 font-normal">{t("wildberries.fbs.columns.article")}</th>
                  <th className="py-2 pr-4 font-normal">{t("wildberries.fbs.columns.price")}</th>
                  <th className="py-2 pr-4 font-normal">{t("wildberries.fbs.columns.status")}</th>
                  <th className="py-2 font-normal">{t("wildberries.fbs.columns.supply")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td className="text-ui-fg-subtle py-4" colSpan={7}>
                      {t("wildberries.fbs.empty")}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    // A row nothing can be done to is not selectable: an empty
                    // action bar is honest, a checkbox that leads to a refusal
                    // is not.
                    const actionable = !order.assemble_refusal || !order.cancel_refusal
                    return (
                      <tr
                        key={order.order_id}
                        className="border-ui-border-base border-b last:border-b-0"
                      >
                        <td className="py-2 pr-2">
                          <Checkbox
                            checked={selected.includes(order.order_id)}
                            disabled={!loaded || isActing || !actionable}
                            onCheckedChange={(checked) => toggle(order.order_id, checked === true)}
                          />
                        </td>
                        <td className="py-2 pr-4 font-mono tabular-nums">{order.order_id}</td>
                        <td className="py-2 pr-4">{formatDateTime(order.created_at, locale)}</td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-col">
                            <span>{order.article ?? NOT_SET}</span>
                            <span className="text-ui-fg-subtle font-mono tabular-nums">
                              {order.nm_id ?? NOT_SET}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {formatMoney(order.price_rub, locale)}
                        </td>
                        <td className="py-2 pr-4">
                          <WbFbsStatusCell order={order} />
                        </td>
                        <td className="text-ui-fg-subtle py-2 font-mono">
                          {order.supply_id ?? NOT_SET}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px]">
                <Select value={supplyId} onValueChange={setSupplyId} disabled={!loaded || isActing}>
                  <Select.Trigger>
                    <Select.Value placeholder={t("wildberries.fbs.supply.newOne")} />
                  </Select.Trigger>
                  <Select.Content>
                    {supplies.map((item) => (
                      <Select.Item key={item.supply_id} value={item.supply_id}>
                        {`${item.name ?? item.supply_id} · ${t("wildberries.fbs.supply.orders", {
                          count: item.orders,
                        })}`}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <Button
                size="small"
                variant="primary"
                disabled={!loaded || isActing || !chosen.length || assembleBlocked.length > 0}
                onClick={assemble}
              >
                {t("wildberries.fbs.assemble.button", { count: chosen.length })}
              </Button>
              <Button
                size="small"
                variant="danger"
                disabled={!loaded || isActing || !chosen.length || cancelBlocked.length > 0}
                onClick={cancel}
              >
                {t("wildberries.fbs.cancel.button", { count: chosen.length })}
              </Button>
            </div>

            {assembleBlocked.length || cancelBlocked.length ? (
              <div className="flex flex-col gap-y-1">
                {assembleBlocked.map((order) => (
                  <Text key={`a-${order.order_id}`} size="small" className="text-ui-fg-subtle">
                    {t("wildberries.fbs.blocked.assemble", {
                      order: order.order_id,
                      reason: order.assemble_refusal,
                    })}
                  </Text>
                ))}
                {cancelBlocked.map((order) => (
                  <Text key={`c-${order.order_id}`} size="small" className="text-ui-fg-subtle">
                    {t("wildberries.fbs.blocked.cancel", {
                      order: order.order_id,
                      reason: order.cancel_refusal,
                    })}
                  </Text>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("wildberries.fbs.supply.title")}
            </Text>
            {supplies.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("wildberries.fbs.supply.empty")}
              </Text>
            ) : (
              supplies.map((item) => (
                <div
                  key={item.supply_id}
                  className="border-ui-border-base flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-col">
                    <Text size="small">{item.name ?? item.supply_id}</Text>
                    <Text size="small" className="text-ui-fg-subtle font-mono">
                      {`${item.supply_id} · ${t("wildberries.fbs.supply.orders", {
                        count: item.orders,
                      })} · ${formatDateTime(item.created_at, locale)}`}
                    </Text>
                  </div>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!loaded || isActing || item.orders < 1}
                    onClick={() => deliver(item)}
                  >
                    {t("wildberries.fbs.deliver.button")}
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge size="2xsmall" color={desk.write.gates.live.enabled ? "orange" : "grey"}>
                {desk.write.gates.live.enabled
                  ? t("wildberries.write.gate.open")
                  : t("wildberries.write.gate.shut")}
              </Badge>
              <Text size="small">
                {desk.write.gates.live.enabled
                  ? t("wildberries.write.gate.liveOn", { env: desk.write.gates.live.env_var })
                  : t("wildberries.write.gate.liveOff", { env: desk.write.gates.live.env_var })}
              </Text>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {desk.write.gates.consent
                ? t("wildberries.fbs.gates.consentGiven")
                : t("wildberries.fbs.gates.consentMissing")}
            </Text>
          </div>

          {result ? <WbFbsResult result={result} /> : null}
        </>
      )}
    </div>
  )
}
