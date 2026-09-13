import { PLAN_SCENARIOS, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { EYEBROW, HEADING, PLANS, ROWS } from "./data";

/**
 * «Тарифы»: три карточки с одинаковыми строками сравнения; кнопка каждой
 * ведёт в воронку с уже выбранным тарифом (концепция §2, строка «воронка с
 * выбранным тарифом»). Спецификация планов — t-2026-09-13-02.
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
            <div key={plan.scenario} className={styles.plan} data-testid={`plan-${plan.scenario}`}>
              <span className="eyebrow">{plan.name}</span>
              <div className={styles.price}>
                {plan.price}
                <small>{plan.period}</small>
              </div>
              <p className={styles.annual}>{plan.annual || " "}</p>

              <dl className={styles.rows}>
                {ROWS.map((label, i) => (
                  <div key={label} className={styles.row}>
                    <dt>{label}</dt>
                    <dd>{plan.values[i]}</dd>
                  </div>
                ))}
              </dl>

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
    </section>
  );
}
