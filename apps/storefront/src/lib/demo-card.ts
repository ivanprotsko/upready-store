/**
 * The demo card's RULES, with no React and no `"use client"` directive.
 *
 * They used to live inside `@modules/checkout/components/demo-card-fields`,
 * which is a client module — and a `"use client"` directive colours every
 * export of its file, not just the component (rule 19g / ~/r/19g.md). A server
 * route that imported `classifyDemoCard` from there would receive a client
 * REFERENCE rather than the function, and fail at call time, far from the
 * import. The paywall demo classifies the card on the server
 * (`app/api/demo/pay/route.ts`), so the rules moved here and the client
 * component re-exports them; every existing call site keeps its import path.
 */

export type DemoCardValue = {
  number: string
  expiry: string
  cvc: string
}

export const EMPTY_DEMO_CARD: DemoCardValue = { number: "", expiry: "", cvc: "" }

const onlyDigits = (value: string) => value.replace(/\D/g, "")

/** Groups digits into 4s as the customer types, capped at 19 (the longest PAN in use). */
export function formatCardNumber(raw: string): string {
  return onlyDigits(raw)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
}

/** `MM/YY`, digits only, capped at 4. */
export function formatExpiry(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function formatCvc(raw: string): string {
  return onlyDigits(raw).slice(0, 4)
}

/** Standard mod-10 check, run on the digits alone (spaces already stripped by the caller). */
export function luhnValid(digits: string): boolean {
  if (digits.length === 0) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/**
 * The two demo suffixes (item 2/4 of the order) are deliberately NOT real
 * Luhn-valid card numbers — they are a documented trigger, not a payment
 * instrument — so a card ending `0000` or `9999` skips the Luhn check as long
 * as the length still looks like a real PAN (13-19 digits). Every other
 * number is held to the real algorithm, which is the "pattern validation"
 * the task asks for.
 */
function numberLooksValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  return luhnValid(digits) || digits.endsWith("0000") || digits.endsWith("9999")
}

/** `null` while the number is still plausible-in-progress or complete; a message key once it's wrong. */
export function cardNumberError(value: string): string | null {
  const digits = onlyDigits(value)
  if (digits.length === 0) return null
  if (digits.length < 13) return null // still typing, not wrong yet
  return numberLooksValid(digits) ? null : "numberIncomplete"
}

export function expiryValid(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 4) return false
  const month = Number(digits.slice(0, 2))
  if (month < 1 || month > 12) return false
  const year = 2000 + Number(digits.slice(2))
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  return endOfMonth.getTime() >= Date.now()
}

export function cvcValid(value: string): boolean {
  const digits = onlyDigits(value)
  return digits.length === 3 || digits.length === 4
}

/** Gates the Pay button (`payment-button/index.tsx`) — every field plausible, nothing more. */
export function isDemoCardComplete(value: DemoCardValue): boolean {
  const digits = onlyDigits(value.number)
  return numberLooksValid(digits) && expiryValid(value.expiry) && cvcValid(value.cvc)
}

export type DemoCardOutcome = "decline" | "redirect" | "approve"

/** `providers/manual.tsx` branches the whole submit flow on this. */
export function classifyDemoCard(value: DemoCardValue): DemoCardOutcome {
  const digits = onlyDigits(value.number)
  if (digits.endsWith("0000")) return "decline"
  if (digits.endsWith("9999")) return "redirect"
  return "approve"
}
