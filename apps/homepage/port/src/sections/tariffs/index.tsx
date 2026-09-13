import { ONBOARDING_SCENARIO, funnelUrl, telegramPlanUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { EYEBROW, HEADING, PLANS, ROWS } from "./data";

/**
 * «Тарифы»: три карточки с одинаковыми строками сравнения. Кнопки ведут в
 * разные места — решение Ивана от 2026-09-14:
 *
 *   • бесплатный тариф → мастер онбординга, магазин создаётся сразу и
 *     бесплатно, платить нечем и незачем;
 *   • платные → телеграм-бот с номером тарифа в диплинке; бот показывает, что
 *     входит в тариф, и принимает оплату.
 *
 * Ссылка в бот уходит НАРУЖУ (`target="_blank"`), мастер — на свой домен, в
 * той же вкладке: пользователь, который пошёл создавать магазин, не должен
 * возвращаться к прайсу через историю браузера.
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
        {PLANS.map((plan, index) => {
          const free = plan.scenario === "free";
          const href = free ? funnelUrl(ONBOARDING_SCENARIO) : telegramPlanUrl(index + 1);
          const title = free
            ? ONBOARDING_SCENARIO.title
            : `Тариф «${plan.name}» — бот расскажет, что входит, и примет оплату`;

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
                href={href}
                title={title}
                data-testid={`plan-cta-${plan.scenario}`}
                {...(free ? {} : { target: "_blank", rel: "noopener noreferrer" })}
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
