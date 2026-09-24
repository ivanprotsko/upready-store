/**
 * The provider id the checkout should have selected, given what the shop
 * currently connects (t-2026-09-24-n10). `current` wins as long as it is
 * still on `available` — the buyer's own pick, or the cart's existing
 * session, survives a re-render. Once it is not (the owner turned Robokassa
 * off between page loads, or disconnected it mid-checkout), the first
 * available method takes over so the page never keeps a dead selection
 * pointed at nothing, and `""` when the shop has connected no method at all.
 *
 * Its own file rather than a `payment.ts` export: that file also carries
 * `paymentMethodName`, which pulls in `@lib/constants` and, with it, the JSX
 * icons of `paymentInfoMap` — vitest has no JSX runtime configured (rule 20,
 * no `.tsx` test exists in this app), so a test importing this function must
 * not drag that chain in.
 */
export function pickActivePaymentMethod(
  current: string,
  available: { id: string }[]
): string {
  if (current && available.some((method) => method.id === current)) {
    return current
  }

  return available[0]?.id ?? ""
}
