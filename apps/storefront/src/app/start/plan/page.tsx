import { OptionLink, Steps } from "../components"
import styles from "../demo.module.css"
import {
  IMPLIED_SERVICE_ID,
  findService,
  formatPrice,
  parseFunnel,
} from "@lib/demo/catalog"

/**
 * S3: pick a plan. Funnel 2 arrives with a service already chosen; funnel 3
 * implies the single service and arrives with nothing. An unknown service in
 * the URL is NOT quietly replaced by the implied one — that would sell a plan
 * of a service nobody picked — the page says so and offers the way back.
 */
export default async function PlanPage(props: {
  searchParams: Promise<{ f?: string; s?: string }>
}) {
  const { f, s } = await props.searchParams
  const funnel = parseFunnel(f)
  const service = funnel === 3 ? findService(IMPLIED_SERVICE_ID) : findService(s)

  const labels = funnel === 3 ? ["Тариф", "Оплата", "Магазин"] : ["Услуга", "Тариф", "Оплата", "Магазин"]
  const current = funnel === 3 ? 1 : 2

  if (!service) {
    return (
      <div className={`${styles.page} ${styles.narrow}`}>
        <Steps labels={labels} current={current} />
        <div className={styles.banner} data-testid="demo-plan-no-service">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>
            Услуга не выбрана, а этот сценарий её требует. Вернитесь на шаг выбора услуги —
            подставлять её за вас здесь неправильно: вы бы платили за то, чего не выбирали.
          </span>
        </div>
        <a className={`${styles.btn} ${styles.btnPrimary}`} href={`/start/service?f=${funnel}`}>
          Выбрать услугу
        </a>
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <Steps labels={labels} current={current} />
      <div className={styles.lede}>
        <h1>Тариф</h1>
        <p>
          {funnel === 3
            ? `Услуга одна — ${service.name.toLowerCase()}. Отличается объёмом каталога и поддержкой.`
            : `${service.name}: выберите объём.`}
        </p>
      </div>

      <div className={styles.options}>
        {service.plans.map((plan) => (
          <OptionLink
            key={plan.id}
            href={`/start/pay?f=${funnel}&s=${service.id}&p=${plan.id}`}
            title={plan.name}
            summary={plan.summary}
            price={formatPrice(plan.price)}
            testId={`demo-plan-${plan.id}`}
          />
        ))}
      </div>

      <div className={styles.actions}>
        <a
          className={`${styles.btn} ${styles.btnSecondary}`}
          href={funnel === 3 ? "/start" : `/start/service?f=${funnel}`}
        >
          Назад
        </a>
      </div>
    </div>
  )
}
