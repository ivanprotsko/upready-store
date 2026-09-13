import { PLAN_SCENARIOS, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { EYEBROW, HEADING, PLANS, PRO_LINE } from "./data";

/**
 * «Тарифы»: два тарифа, кнопка каждого ведёт в кассу с уже выбранным тарифом
 * (концепция §2, строка «воронка с выбранным тарифом»).
 */
export default function Tariffs() {
  return (
    <section
      id="sec-tariffs"
      data-section="tariffs"
      data-testid="sec-tariffs"
      className={styles.section}
    >
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>

      <div className={styles.plans}>
        {PLANS.map((plan) => {
          const scenario = PLAN_SCENARIOS[plan.scenario];
          return (
            <div key={plan.scenario} className={styles.plan}>
              <span className="eyebrow">{plan.name}</span>
              <div className={styles.price}>
                {plan.price}
                <small>{plan.period}</small>
              </div>
              <p>{plan.summary}</p>
              <a
                className={`btn ${styles.planCta}`}
                href={funnelUrl(scenario)}
                title={scenario.title}
                data-testid={`plan-cta-${plan.scenario}`}
              >
                {plan.cta}
              </a>
            </div>
          );
        })}
      </div>

      <p className={styles.pro}>{PRO_LINE}</p>
    </section>
  );
}
