"use client"

import { requisiteIconSrc, type PaymentRequisite } from "@lib/tenant/manual-payment"
import { Check, ChevronDownMini, SquareTwoStack } from "@medusajs/icons"
import { Badge, Text, clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { useEffect, useId, useRef, useState } from "react"

/**
 * The shop's requisites as the buyer uses them (batch 7, Ivan 03.10: «человек
 * нажимал на пункт и ему показывался номер … выбирает USDT или USDC и ему показывают
 * номер и сеть … Должна быть иконка "скопировать"»). ONE list, in the owner's
 * order: a bank item is its icon and name, a crypto item its asset mark and the
 * network badge. A click expands the item to the number (or the address and the
 * network) and the holder, each with a copy button; one item is open at a time.
 *
 * Every value here is the owner's own, from the panel. Nothing is a default.
 */

/** Copies through the async clipboard, else through a hidden textarea (an insecure context, an old WebView). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** The bank's initials for a bank without a preset icon: «Другой банк» → «ДБ». */
export const requisiteInitials = (item: PaymentRequisite): string => {
  if (item.kind === "crypto") {
    return item.currency.slice(0, 4)
  }
  const words = item.bank.split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase())
  return letters.join("") || "?"
}

/** How long the row says «Скопировано» with the check mark before it looks as before. */
export const COPIED_MS = 1500

/**
 * Copies `value` on demand and reports `copied` for `COPIED_MS` after a successful
 * copy. A second click within that window restarts the window.
 */
export const useCopied = (value: string) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
      }
    },
    []
  )

  const copy = async () => {
    const ok = await copyText(value)
    if (!ok) {
      return
    }
    setCopied(true)
    if (timer.current) {
      clearTimeout(timer.current)
    }
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return { copied, copy }
}

/** The bank logo or the asset mark, 32 px; the initials in a badge when there is none or it fails to load. */
export const RequisiteIcon = ({
  item,
  size = 32,
}: {
  item: PaymentRequisite
  size?: 20 | 32
}) => {
  const src = requisiteIconSrc(item)
  const [failed, setFailed] = useState(false)
  const box = size === 32 ? "h-8 w-8" : "h-5 w-5"

  if (!src || failed) {
    return (
      <span
        className={clx(
          box,
          "inline-flex shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle txt-compact-xsmall-plus text-ui-fg-subtle"
        )}
        aria-hidden
        data-testid="requisite-icon-fallback"
      >
        {requisiteInitials(item)}
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={clx(box, "shrink-0 rounded-md object-contain")}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * One copyable value: a label over the value, the copy mark at the end. The WHOLE
 * row is the button (Ivan 04.10: «целый контейнер был кликабельным для выполнения
 * копирования»): a click anywhere copies, the row then says «Скопировано» with a
 * check mark for `COPIED_MS` and goes back. No hover tint on the row either.
 */
const ValueRow = ({
  label,
  value,
  copyValue,
  copyLabel,
  mono = true,
  "data-testid": testId,
}: {
  label: string
  value: string
  copyValue?: string
  copyLabel: string
  mono?: boolean
  "data-testid": string
}) => {
  const t = useTranslations("ManualPayment")
  const { copied, copy } = useCopied(copyValue ?? value)

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copyLabel}
      className="flex w-full cursor-pointer items-center gap-x-2 rounded-md bg-ui-bg-subtle px-3 py-2 text-start focus-visible:outline-none focus-visible:shadow-borders-interactive-with-active"
      data-testid={`${testId}-copy`}
      data-copied={copied ? "true" : undefined}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <Text as="span" size="xsmall" className="text-ui-fg-subtle">
          {label}
        </Text>
        <span
          className={clx(
            // No `select-all`: the row itself copies, and the click must not paint the value blue.
            "block select-none break-all txt-compact-medium text-ui-fg-base",
            mono && "font-mono tabular-nums"
          )}
          data-testid={testId}
        >
          {value}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-x-1.5">
        <span
          role="status"
          className={clx("txt-compact-xsmall-plus text-ui-tag-green-text", !copied && "sr-only")}
          data-testid={`${testId}-copy-status`}
        >
          {copied ? t("copied") : ""}
        </span>
        <span className="inline-flex h-7 w-7 items-center justify-center text-ui-fg-muted" aria-hidden>
          {copied ? <Check className="text-ui-tag-green-icon" /> : <SquareTwoStack />}
        </span>
      </span>
    </button>
  )
}

const RequisiteItem = ({
  item,
  open,
  onToggle,
}: {
  item: PaymentRequisite
  open: boolean
  onToggle: () => void
}) => {
  const t = useTranslations("ManualPayment")
  const detailsId = useId()
  const name = item.kind === "bank" ? item.bank : item.currency

  return (
    <li data-testid={`requisite-${item.kind}`} data-requisite-id={item.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={onToggle}
        // Ivan 04.10: «убрать при наведении изменение цвета пункта» — no hover tint, the chevron says it opens.
        className="flex w-full items-center gap-x-3 px-4 py-3 text-start focus-visible:outline-none focus-visible:shadow-borders-interactive-with-active"
        data-testid="requisite-toggle"
      >
        <RequisiteIcon item={item} />
        <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
          <Text size="small" weight="plus" className="truncate text-ui-fg-base" data-testid="requisite-name">
            {name}
          </Text>
          {item.kind === "crypto" ? (
            <span>
              <Badge size="2xsmall" color="grey" data-testid="requisite-network">
                {item.network}
              </Badge>
            </span>
          ) : (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {open ? t("hideRequisite") : t("showRequisite")}
            </Text>
          )}
        </span>
        <ChevronDownMini
          className={clx("shrink-0 text-ui-fg-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div id={detailsId} className="flex flex-col gap-y-2 px-4 pb-4" data-testid="requisite-details">
          {item.kind === "bank" ? (
            <>
              <ValueRow
                label={t("numberLabel")}
                value={item.number}
                copyValue={item.number.replace(/\s+/g, "")}
                copyLabel={t("copyNumber")}
                data-testid="requisite-number"
              />
              {item.holder && (
                <ValueRow
                  label={t("holderLabel")}
                  value={item.holder}
                  copyLabel={t("copyHolder")}
                  mono={false}
                  data-testid="requisite-holder"
                />
              )}
            </>
          ) : (
            <>
              <ValueRow
                label={t("addressLabel")}
                value={item.address}
                copyLabel={t("copyAddress")}
                data-testid="requisite-address"
              />
              <ValueRow
                label={t("networkLabel")}
                value={item.network}
                copyLabel={t("copyNetwork")}
                mono={false}
                data-testid="requisite-network-value"
              />
              <Text size="xsmall" className="text-ui-fg-subtle" data-testid="requisite-warning">
                {t("cryptoOnlyWarning", { currency: item.currency, network: item.network })}
              </Text>
            </>
          )}
        </div>
      )}
    </li>
  )
}

type Props = {
  requisites: PaymentRequisite[]
  /** Which item starts open; none by default — the buyer picks. */
  defaultOpenId?: string | null
}

const RequisitesList = ({ requisites, defaultOpenId = null }: Props) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId)

  if (requisites.length === 0) {
    return null
  }

  return (
    <ul
      className="flex flex-col divide-y divide-ui-border-base overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base"
      data-testid="requisites-list"
    >
      {requisites.map((item) => (
        <RequisiteItem
          key={item.id}
          item={item}
          open={openId === item.id}
          onToggle={() => setOpenId((current) => (current === item.id ? null : item.id))}
        />
      ))}
    </ul>
  )
}

export default RequisitesList

/**
 * The same list before the order exists (the checkout's payment step): the icons
 * and names only, as a row of pills — the numbers come after «Оформить заказ».
 */
export const RequisitesPreview = ({ requisites }: { requisites: PaymentRequisite[] }) => {
  if (requisites.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2" data-testid="requisites-preview">
      {requisites.map((item) => (
        <li
          key={item.id}
          className="inline-flex items-center gap-x-1.5 rounded-full border border-ui-border-base bg-ui-bg-base px-2.5 py-1 txt-compact-xsmall-plus text-ui-fg-base"
        >
          <RequisiteIcon item={item} size={20} />
          <span>{item.kind === "bank" ? item.bank : `${item.currency} · ${item.network}`}</span>
        </li>
      ))}
    </ul>
  )
}
