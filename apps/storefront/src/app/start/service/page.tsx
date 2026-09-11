import { Steps } from "../components"
import styles from "../demo.module.css"
import { OptionLink } from "../components"
import { FUNNELS, SERVICES, formatPrice, parseFunnel } from "@lib/demo/catalog"

/**
 * S2: pick a service. Two funnels arrive here and they leave differently —
 * funnel 2 goes on to pick a plan, funnel 4 has a single plan per service and
 * goes straight to the till. The page is one, the NEXT hop is what differs.
 */
export default async function ServicePage(props: {
  searchParams: Promise<{ f?: string }>
}) {
  const { f } = await props.searchParams
  const funnel = parseFunnel(f)
  const soloPlan = funnel === 4

  const labels = soloPlan ? ["Услуга", "Оплата", "Магазин"] : ["Услуга", "Тариф", "Оплата", "Магазин"]

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <Steps labels={labels} current={1} />
      <div className={styles.lede}>
        <h1>Что делаем</h1>
        <p>
          {soloPlan
            ? "У каждой услуги один тариф — цена под названием и есть цена."
            : "Одна услуга — одна воронка. Тариф выбирается на следующем шаге."}
        </p>
      </div>

      <div className={styles.options}>
        {SERVICES.map((service) => {
          const solo = service.plans.find((p) => p.id === service.soloPlanId)
          const cheapest = service.plans.reduce((a, b) => (a.price <= b.price ? a : b))
          const price = soloPlan && solo ? formatPrice(solo.price) : `от ${formatPrice(cheapest.price)}`
          const href = soloPlan
            ? `/start/pay?f=4&s=${service.id}`
            : `/start/plan?f=${funnel}&s=${service.id}`

          return (
            <OptionLink
              key={service.id}
              href={href}
              title={service.name}
              summary={service.summary}
              price={price}
              testId={`demo-service-${service.id}`}
            />
          )
        })}
      </div>

      <div className={styles.actions}>
        <a className={`${styles.btn} ${styles.btnSecondary}`} href="/start">
          Назад
        </a>
        <span className={styles.hint} style={{ alignSelf: "center" }}>
          {FUNNELS[funnel].title}: {FUNNELS[funnel].steps.join(" → ")}
        </span>
      </div>
    </div>
  )
}
