import { Chain } from "./components"
import styles from "./demo.module.css"
import { DIRECT_PLAN_ID, FUNNELS, findPlan, formatPrice } from "@lib/demo/catalog"

const FUNNEL_IDS = [1, 2, 3, 4] as const

/**
 * S1 of the mockup (artifacts/docs/2026-09-12-paywall-onboarding-mockup.md):
 * four equal entries, none of them highlighted as the right one — Ivan is
 * comparing the SHAPES of four funnels, and a featured card would answer the
 * question he is asking.
 */
export default function StartPage() {
  const direct = findPlan(DIRECT_PLAN_ID)

  return (
    <div className={styles.page}>
      <div className={styles.lede}>
        <h1>Четыре формы воронки, один магазин на выходе</h1>
        <p>
          Каждая карточка — рабочий путь целиком: оплата тестовой картой, затем онбординг, где вы
          задаёте настройки своего магазина и получаете его адрес.
        </p>
      </div>

      <div className={styles.grid}>
        {FUNNEL_IDS.map((id) => {
          const funnel = FUNNELS[id]
          const label =
            id === 1 && direct ? `${funnel.cta} · ${formatPrice(direct.plan.price)}` : funnel.cta

          return (
            <div className={styles.card} key={id}>
              <div className={styles.eyebrow}>Сценарий {id}</div>
              <h2>{funnel.title}</h2>
              <p>{funnel.summary}</p>
              <Chain steps={funnel.steps} />
              <div className={styles.cardFoot}>
                <a
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
                  href={funnel.href}
                  data-testid={`demo-funnel-${id}`}
                >
                  {label}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      <hr className={styles.rule} />

      <div className={styles.direct}>
        <p>
          <strong>Онбординг без оплаты.</strong> Прямая ссылка в тот же мастер — чтобы смотреть сам
          сценарий заведения магазина.
        </p>
        <a
          className={`${styles.btn} ${styles.btnSecondary}`}
          href="/start/onboarding"
          data-testid="demo-onboarding-direct"
        >
          Открыть онбординг
        </a>
      </div>
    </div>
  )
}
