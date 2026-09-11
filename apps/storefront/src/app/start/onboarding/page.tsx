import { cookies } from "next/headers"

import styles from "../demo.module.css"
import Wizard from "./wizard"
import { findPlan, formatPrice } from "@lib/demo/catalog"
import { PAID_COOKIE } from "@lib/demo/paid"

/**
 * S5–S8: the onboarding wizard. Reachable two ways on purpose — at the end of
 * any of the four funnels, and by the direct link on the showcase — so the
 * scenario can be looked at without paying for it. The paid cookie only
 * changes what the page SAYS; it never gates the wizard, because gating it
 * would break the direct link Ivan asked for.
 */
export default async function OnboardingPage() {
  const jar = await cookies()
  const raw = jar.get(PAID_COOKIE)?.value

  let paidLine: string | null = null
  if (raw) {
    try {
      const paid = JSON.parse(raw) as { planId?: string; price?: number }
      const found = findPlan(paid.planId ?? null)
      paidLine = found
        ? `Оплачено: ${found.service.name}, тариф «${found.plan.name}» — ${formatPrice(found.plan.price)}`
        : "Оплачено"
    } catch {
      // A cookie we cannot read is a cookie we do not trust — the wizard is
      // the same either way, so this only loses the line above it.
      paidLine = null
    }
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <Wizard paidLine={paidLine} />
    </div>
  )
}
