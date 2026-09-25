import { cookies } from "next/headers"

import styles from "../demo.module.css"
import Wizard from "./wizard"
import { findPlan, formatPrice } from "@lib/demo/catalog"
import { PAID_COOKIE, readTariffPaidRecord } from "@lib/demo/paid"
import { daysLabel, resolveTariffLink } from "@lib/demo/tariff"
import { typo } from "@lib/platform-pricing/typo"

/**
 * S5–S8: the onboarding wizard. Reachable two ways on purpose — at the end of
 * any of the four funnels, and by the direct link on the showcase — so the
 * scenario can be looked at without paying for it. The paid cookie only
 * changes what the page SAYS; it never gates the wizard, because gating it
 * would break the direct link Ivan asked for.
 */
export default async function OnboardingPage(props: {
  searchParams: Promise<{ tariff?: string; trial?: string }>
}) {
  const { tariff, trial } = await props.searchParams
  const jar = await cookies()
  const raw = jar.get(PAID_COOKIE)?.value

  // Entered from a pricing button (t-2026-09-25-08): the line names the tariff
  // and how it was reached. The till is a demo one, so neither line claims a
  // charge or a bound card (rule 20a).
  const fromPricing = await resolveTariffLink({ tariff, trial })
  if (fromPricing) {
    let line: string
    if (fromPricing.broken) {
      console.error("onboarding: broken pricing link", fromPricing.reason)
      line = "Тариф из ссылки не найден на странице тарифов — магазин можно создать и без него."
    } else {
      const name = typo(fromPricing.tier.name)
      const record = readTariffPaidRecord(raw)
      const viaTill = record && record.tariff === fromPricing.tier.id ? record : null
      if (viaTill?.kind === "trial" && viaTill.trialDays !== null) {
        line = `Тариф «${name}»: пробный период ${daysLabel(viaTill.trialDays)}. Карта введена в демо-кассе — не привязана, ничего не списано.`
      } else if (viaTill?.kind === "paid") {
        line = `Тариф «${name}» — ${typo(fromPricing.tier.price)}, оплачено в демо-кассе: деньги не списаны.`
      } else {
        line = `Тариф «${name}» — без оплаты.`
      }
    }
    return (
      <div className={`${styles.page} ${styles.narrow}`}>
        <Wizard paidLine={line} />
      </div>
    )
  }

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
