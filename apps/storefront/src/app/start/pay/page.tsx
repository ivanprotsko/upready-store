import { Steps } from "../components"
import styles from "../demo.module.css"
import PayForm from "./pay-form"
import { FUNNELS, formatPrice, parseFunnel, resolveOffer } from "@lib/demo/catalog"

/** Where a funnel's till sits in its own step rail, and what those steps read. */
function rail(funnel: 1 | 2 | 3 | 4): { labels: string[]; current: number } {
  switch (funnel) {
    case 1:
      return { labels: ["Оплата", "Магазин"], current: 1 }
    case 2:
      return { labels: ["Услуга", "Тариф", "Оплата", "Магазин"], current: 3 }
    case 3:
      return { labels: ["Тариф", "Оплата", "Магазин"], current: 2 }
    case 4:
      return { labels: ["Услуга", "Оплата", "Магазин"], current: 2 }
  }
}

/**
 * S4: the till, shared by all four funnels. What it sells is resolved from the
 * funnel and its answers, never guessed — an unanswered step sends the visitor
 * back to the step that asks, because a substituted default would charge for
 * something nobody chose (rule 20a).
 */
export default async function PayPage(props: {
  searchParams: Promise<{ f?: string; s?: string; p?: string }>
}) {
  const { f, s, p } = await props.searchParams
  const funnel = parseFunnel(f)
  const offer = resolveOffer(funnel, s ?? null, p ?? null)
  const { labels, current } = rail(funnel)

  if (!offer) {
    return (
      <div className={`${styles.page} ${styles.narrow}`}>
        <Steps labels={labels} current={current} />
        <div className={styles.banner} data-testid="demo-pay-incomplete">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>
            Этот сценарий требует выбора, которого в ссылке нет. Пройдите его с начала — подставлять
            услугу или тариф за вас нельзя.
          </span>
        </div>
        <a className={`${styles.btn} ${styles.btnPrimary}`} href={FUNNELS[funnel].href}>
          {FUNNELS[funnel].cta}
        </a>
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <Steps labels={labels} current={current} />

      <div className={styles.summary} data-testid="demo-pay-summary">
        <div className={styles.summaryLine}>
          <span className={styles.key}>Услуга</span>
          <span className={styles.value}>{offer.service.name}</span>
        </div>
        <div className={styles.summaryLine}>
          <span className={styles.key}>Тариф</span>
          <span className={styles.value}>{offer.plan.name}</span>
        </div>
        <div className={`${styles.summaryLine} ${styles.summaryTotal}`}>
          <span className={styles.key}>К оплате</span>
          <span className={styles.value}>{formatPrice(offer.plan.price)}</span>
        </div>
      </div>

      <PayForm
        funnel={funnel}
        serviceId={offer.service.id}
        planId={offer.plan.id}
        amountLabel={formatPrice(offer.plan.price)}
      />
    </div>
  )
}
