/**
 * The CDEK label and receipt of an order's fulfillment (t-2026-10-14-58,
 * part A). The backend answers the PDF itself
 * (`GET /tenants/orders/:id/fulfillments/:fulfillment_id/cdek/label|waybill`),
 * read inside the panel's authenticated fetch, because the file carries the
 * buyer's name and phone and never gets a URL of its own.
 *
 * No JSX and no SDK here, so `__tests__/cdek-print.test.mjs` runs it for real.
 */

/** The provider id Medusa gives the backend's `cdek` fulfillment provider. */
export const CDEK_PROVIDER_ID = "cdek_cdek"

export type CdekPrintKind = "label" | "waybill"

type CdekFulfillment = {
  provider_id?: string | null
  canceled_at?: string | Date | null
  data?: Record<string, unknown> | null
  labels?: Array<{ tracking_number?: string | null }> | null
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

/**
 * A fulfillment CDEK can print for: sent through CDEK, registered there
 * (`data.cdek_order_uuid`, written when the fulfillment was created) and not
 * cancelled, which deletes the shipment in CDEK.
 */
export const isCdekPrintable = (fulfillment: CdekFulfillment): boolean =>
  fulfillment.provider_id === CDEK_PROVIDER_ID &&
  !fulfillment.canceled_at &&
  text(fulfillment.data?.cdek_order_uuid) !== null

/**
 * CDEK's own number of the shipment, from its status webhook
 * (`data.cdek_number`), when the card does not already show it as a
 * tracking label.
 */
export const cdekNumberToShow = (fulfillment: CdekFulfillment): string | null => {
  if (fulfillment.provider_id !== CDEK_PROVIDER_ID) {
    return null
  }
  const number = text(fulfillment.data?.cdek_number)
  if (!number) {
    return null
  }
  const shown = (fulfillment.labels ?? []).some(
    (label) => text(label?.tracking_number) === number
  )
  return shown ? null : number
}

export const cdekTrackingUrl = (number: string): string =>
  `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(number)}`

export const cdekPrintPath = (
  orderId: string,
  fulfillmentId: string,
  kind: CdekPrintKind
): string =>
  `/tenants/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(
    fulfillmentId
  )}/cdek/${kind}`

export const cdekPdfFilename = (
  kind: CdekPrintKind,
  displayId: string | number
): string =>
  kind === "label" ? `cdek-label-${displayId}.pdf` : `cdek-receipt-${displayId}.pdf`

/**
 * The toast of a refusal, as `[key, values]` for `t`. The panel's SDK keeps the
 * status and the `message` of an error answer and drops its `code`, so the
 * backend gives every code a status of its own (`tenants/orders/cdek/helpers.ts`):
 * 409 `cdek_not_registered`, 504 `cdek_print_timeout`, 502 `cdek_print_failed`
 * with CDEK's error code as the message. Any other status shows the backend's
 * own sentence, which is Russian already.
 */
export const cdekPrintErrorText = (
  error: { status?: number; message?: string } | null | undefined
):
  | { key: string; values?: Record<string, string> }
  | { message: string } => {
  switch (error?.status) {
    case 409:
      return { key: "orders.fulfillment.cdek.errors.notRegistered" }
    case 504:
      return { key: "orders.fulfillment.cdek.errors.timeout" }
    case 502:
      return {
        key: "orders.fulfillment.cdek.errors.failed",
        values: { message: error.message || "—" },
      }
    default:
      return { message: error?.message || "—" }
  }
}

type PdfWindow = {
  location: { href: string }
  close: () => void
  opener?: unknown
  document?: { title: string; body?: { textContent: string | null } | null }
}

/**
 * Opens the tab the PDF will land in. It has to happen in the click itself:
 * CDEK takes up to 20 seconds to make the file, and a browser blocks a
 * `window.open` that long after the click. `null` when the browser blocks
 * it anyway; the file is then saved instead ({@link showPdf}).
 */
export const openPdfTab = (
  waitingText: string,
  open: (url: string, target: string) => PdfWindow | null = (url, target) =>
    window.open(url, target) as unknown as PdfWindow | null
): PdfWindow | null => {
  const tab = open("", "_blank")
  if (tab) {
    // The tab only ever shows our own blob; it needs no handle on the panel.
    tab.opener = null
  }
  if (tab?.document) {
    tab.document.title = waitingText
    if (tab.document.body) {
      tab.document.body.textContent = waitingText
    }
  }
  return tab
}

/**
 * Shows the PDF in the tab opened for it, or saves it as `filename` when there
 * is no tab. The blob URL lives a minute, long enough for the tab to load it.
 */
export const showPdf = (blob: Blob, filename: string, tab: PdfWindow | null): void => {
  const url = URL.createObjectURL(blob)

  if (tab) {
    tab.location.href = url
  } else {
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
