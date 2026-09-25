import Link from "next/link"

import type { ResolvedTariff } from "@lib/demo/tariff"
import { daysLabel } from "@lib/demo/tariff"
import { typo } from "@lib/platform-pricing/typo"

import { Steps } from "../components"
import styles from "../demo.module.css"
import PayForm from "./pay-form"

/**
 * The till entered from a pricing button (t-2026-09-25-08): «оплата сначала»
 * (`pay_first`) or «карта и пробный период» (`card_trial`). It is the same demo
 * till the four funnels use, with no payment provider behind it
 * (t-2026-09-25-06), and it says so before the card form: nothing is charged,
 * no card is bound, now or when the trial ends (rule 20a).
 */
export default function TariffTill({ resolved }: { resolved: ResolvedTariff }) {
  if (resolved.broken) {
    console.error("tariff till: broken pricing link", resolved.reason)
    return (
      <div className={`${styles.page} ${styles.narrow}`}>
        <div className={styles.banner} data-testid="demo-pay-tariff-broken">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>
            В ссылке нет тарифа с сайта или он уже снят. Откройте тарифы и выберите его заново —
            подставлять тариф за вас нельзя.
          </span>
        </div>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/pricing">
          К тарифам
        </Link>
      </div>
    )
  }

  const { tier, trialDays } = resolved
  const trial = trialDays !== null
  const price = typo(tier.price)

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <Steps labels={trial ? ["Карта", "Магазин"] : ["Оплата", "Магазин"]} current={1} />

      <div className={styles.summary} data-testid="demo-pay-summary">
        <div className={styles.summaryLine}>
          <span className={styles.key}>Тариф</span>
          <span className={styles.value}>{typo(tier.name)}</span>
        </div>
        <div className={styles.summaryLine}>
          <span className={styles.key}>Стоимость тарифа</span>
          <span className={styles.value}>
            {price}
            {tier.price_note ? ` ${typo(tier.price_note)}` : null}
          </span>
        </div>
        {trial ? (
          <>
            <div className={styles.summaryLine} data-testid="demo-pay-trial">
              <span className={styles.key}>Пробный период</span>
              <span className={styles.value}>{daysLabel(trialDays)}</span>
            </div>
            <div className={`${styles.summaryLine} ${styles.summaryTotal}`}>
              <span className={styles.key}>Сейчас к оплате</span>
              <span className={styles.value}>0 ₽</span>
            </div>
          </>
        ) : (
          <div className={`${styles.summaryLine} ${styles.summaryTotal}`}>
            <span className={styles.key}>К оплате</span>
            <span className={styles.value}>{price}</span>
          </div>
        )}
      </div>

      <div className={styles.banner} data-testid="demo-pay-demo-notice">
        <span className={styles.dot} />
        <span>
          {trial
            ? `Это демо-касса: оплата на сайте пока не подключена. Карта нигде не сохраняется и не привязывается, ничего не списывается — ни сейчас, ни после пробного периода (${daysLabel(trialDays)}).`
            : "Это демо-касса: оплата на сайте пока не подключена, деньги не списываются."}
        </span>
      </div>

      <PayForm
        tariff={{ id: tier.id, trialDays }}
        submitLabel={trial ? `Начать пробный период · ${daysLabel(trialDays)}` : `Оплатить ${price}`}
      />
    </div>
  )
}
